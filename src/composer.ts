import * as dayjs from 'dayjs';
import * as inquirer from 'inquirer';
import * as _ from 'lodash';
import { ArrayFileHandler } from './array-file-handler';
import * as track from './track';

const levenshtein = require('js-levenshtein');
const pluralize = require('pluralize');

export interface IComposer {
  name: string;       // Name as key
  aliases: string[];  // Other ways of representing name
  born: string;       // Valid dayjs input
  died?: string;      // Valid dayjs input, or undefined is still living
}

export interface IComposerUpdater extends Partial<IComposer> {
  name: string;
}

export interface IComposerStats {
  nComposers: number;
}

const ADD = '<add new>';
const SKIP = '<skip for now>';

const composerFile = new ArrayFileHandler<IComposer>('composers.json');

export const fetchAll = () => composerFile.fetch();

const indexComposers = (composers?: IComposer[]) => 
  (composers ?? fetchAll())
    .reduce<Record<string,IComposer>>((accum, composer) => ({
       ...accum,
       [composer.name]: composer,
       ...composer.aliases.reduce<Record<string,IComposer>>((ac, alias) => ({ ...ac, [alias]: composer }), {} as Record<string,IComposer>),
    }), {} as Record<string,IComposer>);

export const find = (name: string, composers?: IComposer[]) => indexComposers(composers)[name];
export const suggest = (name: string) => _.sortBy(fetchAll().map((composer:IComposer) => ({
  distance: [ levenshtein(composer.name, name), ...composer.aliases.map((alias) => levenshtein(alias,name))].sort()[0],
  composer,
})), ['distance']);

const checkAliases = (composer: IComposer, composers: IComposer[]) => {
  const index = indexComposers(composers);
  return composer.aliases.map<IComposer | undefined>((alias) => index[alias]).filter((c) => !!c && c !== composer);
}
  
export const add = (composer: IComposer) => {
  const composers = fetchAll();
  const existing = find(composer.name, composers);
  if (existing) {
    console.error(`Composer ${composer.name} already exists`, existing);
    return;
  }
  const existingAliases = checkAliases(composer, composers);
  if (existingAliases.length > 0) {
    console.error(`The following aliases for this composer already exist`, existingAliases);
    return;
  }
  composerFile.save([...composers, composer]);
};

export const update = (updates: IComposerUpdater) => {
  const composers = fetchAll();
  const existing = find(updates.name, composers);
  if (!existing) {
    console.error(`No composer named ${updates.name} found to update`);
  }
  _.merge(existing, updates);
  if (updates.aliases) {
    const existingAliases = checkAliases(existing, composers);
    if (existingAliases.length > 0) {
      console.error(`The following aliases for this composer already exist`, existingAliases);
      return;
    }
  }
  composerFile.save(composers);
};

export const stats = (): IComposerStats => {
  const composers = fetchAll();
  return {
    nComposers: composers.length,
  };
};

export const resolveAll = async () => {
  const index = indexComposers();
  const tracks = track.fetchAll();
  const tracksToResolve = tracks.filter((t) => t.composerKey && !index[t.composerKey]);
  const tracksSansComposer = tracks.filter((t) => !t.composerKey);
  const byComposer = _.groupBy(tracksToResolve, 'composerKey');
  const names = Object.keys(byComposer);
  console.log(`${pluralize('composer', names.length, true)} to resolve, ${pluralize('track', tracksSansComposer.length, true)} with no composer`);
  return names.reduce(async (acc, name) => {
    await acc;
    return resolve(name, byComposer[name]);
  }, Promise.resolve());
};

export const resolve = async (name: string, tracks?: track.ITrack[]) => {
  const options = [SKIP, ADD, ...suggest(name)];
  const { option } = await inquirer.prompt([
    {
      name: 'option',
      type: 'list',
      default: options[Math.min(options.length - 1, 2)],   // First suggestion or ADD
      choices: options,
      message: name,
    }
  ]);
};
