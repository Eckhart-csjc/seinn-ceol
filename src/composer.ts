import * as dayjs from 'dayjs';
import * as _ from 'lodash';
import { ArrayFileHandler } from './array-file-handler';

const levenshtein = require('js-levenshtein');

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

const composerFile = new ArrayFileHandler<IComposer>('composers.json');

const indexComposers = (composers?: IComposer[]) => 
  (composers ?? composerFile.fetch())
    .reduce<Record<string,IComposer>>((accum, composer) => ({
       ...accum,
       [composer.name]: composer,
       ...composer.aliases.reduce<Record<string,IComposer>>((ac, alias) => ({ ...ac, [alias]: composer }), {} as Record<string,IComposer>),
    }), {} as Record<string,IComposer>);

export const find = (name: string, composers?: IComposer[]) => indexComposers(composers)[name];
export const suggest = (name: string) => _.sortBy(composerFile.fetch().map((composer:IComposer) => ({
  distance: [ levenshtein(composer.name, name), ...composer.aliases.map((alias) => levenshtein(alias,name))].sort()[0],
  composer,
})), ['distance']);

const checkAliases = (composer: IComposer, composers: IComposer[]) => {
  const index = indexComposers(composers);
  return composer.aliases.map<IComposer | undefined>((alias) => index[alias]).filter((c) => !!c && c !== composer);
}
  
export const add = (composer: IComposer) => {
  const composers = composerFile.fetch();
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
  const composers = composerFile.fetch();
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
  const composers = composerFile.fetch();
  return {
    nComposers: composers.length,
  };
};
