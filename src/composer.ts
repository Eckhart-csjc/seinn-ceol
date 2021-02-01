import * as inquirer from 'inquirer';
import * as _ from 'lodash';
import { ArrayFileHandler } from './array-file-handler';
import * as keypress from './keypress';
import * as track from './track';
import { error, notification, printLn, warning } from './util';

const dayjs = require('dayjs');
const levenshtein = require('js-levenshtein');
const pluralize = require('pluralize');

export interface IComposer {
  name: string;                // Name as key
  aliases: string[];           // Other ways of representing name
  born: string | number;       // Valid dayjs input
  died?: string | number;      // Valid dayjs input, or undefined is still living
}

export interface IComposerUpdater extends Partial<IComposer> {
  name: string;
}

export interface IComposerStats {
  nComposers: number;
  detail: IComposerStatsDetail[];
}

export interface IComposerStatsDetail {
  name: string;
  nTracks: number;
  albums: string[];
  totalTime: number;
}

const ADD = '<add new>';
const SKIP = '<skip for now>';
const VIEW = '<view tracks>';

const composerFile = new ArrayFileHandler<IComposer>('composers.json');

export const fetchAll = () => composerFile.fetch();

export const indexComposers = (composers?: IComposer[]) => 
  (composers ?? fetchAll())
    .reduce<Record<string,IComposer>>((accum, composer) => ({
       ...accum,
       [composer.name]: composer,
       ...composer.aliases.reduce<Record<string,IComposer>>((ac, alias) => ({ ...ac, [alias]: composer }), {} as Record<string,IComposer>),
    }), {} as Record<string,IComposer>);

export const find = (name: string, composers?: IComposer[]) => indexComposers(composers)[name];

const splitWords = (s: string) => s.split(/[ \-&,]/);

const getDistance = (a:string, b:string) => {
  const bw = splitWords(b).filter((w) => !!w);
  const scores = _.flatten(splitWords(a).filter((w) => !!w).map((w) => bw.map((w2) => levenshtein(w, w2)))).sort();
  const score = scores.slice(0, 2).reduce((acc, s) => acc + s, 0) / 2;
  return score;
};

const getBestDistance = (name: string, composer: IComposer) => {
  const distances = [ getDistance(name, composer.name), ...composer.aliases.map((alias) => getDistance(name, alias)) ];
  const best = distances.sort()[0];
  return best;
}

export const suggest = (name: string) => _.sortBy(fetchAll().map((composer:IComposer) => ({
  distance: getBestDistance(name, composer),
  composer,
})), ['distance']);

const checkAliases = (composer: IComposer, composers: IComposer[]) => {
  const index = indexComposers(composers);
  return composer.aliases.map<IComposer | undefined>((alias) => index[alias]).filter((c) => !!c && c !== composer);
}
  
export const add = (composer: IComposer): boolean => {
  const composers = fetchAll();
  const existing = find(composer.name, composers);
  if (existing) {
    error(`Composer ${composer.name} already exists`, existing);
    return false;
  }
  const existingAliases = checkAliases(composer, composers);
  if (existingAliases.length > 0) {
    error(`The following aliases for this composer already exist`, existingAliases);
    return false;
  }
  composerFile.save([...composers, composer]);
  return true;
};

export const update = (updates: IComposerUpdater): boolean => {
  const composers = fetchAll();
  const existing = find(updates.name, composers);
  if (!existing) {
    error(`No composer named ${updates.name} found to update`);
    return false;
  }
  _.merge(existing, updates);
  if (updates.aliases) {
    const existingAliases = checkAliases(existing, composers);
    if (existingAliases.length > 0) {
      error(`The following aliases for this composer already exist`, existingAliases);
      return false;
    }
  }
  composerFile.save(composers);
  return true;
};

export const stats = (): IComposerStats => {
  const composers = fetchAll();
  const index = indexComposers(composers);
  const tracks = track.fetchAll();
  const detailByComposer = tracks.reduce((accum, t) => {
    const c = t.composerKey ? index[t.composerKey] : undefined;
    const name = c?.name ?? 'Unknown';
    const curr = accum[name] ?? {
      name,
      nTracks: 0,
      albums: [],
      totalTime: 0,
    }
    return {
      ...accum,
      [name]: {
        ...curr,
        nTracks: curr.nTracks + 1,
        albums: t.album ? _.uniq([ ...curr.albums, t.album ]) : curr.albums,
        totalTime: curr.totalTime + (t.duration ?? 0),
      },
    };
  }, {} as Record<string, IComposerStatsDetail>);
  return {
    nComposers: composers.length,
    detail: _.values(detailByComposer),
  };
};

const getValues = async (known: Partial<IComposer>, index: Record<string, IComposer>, existing?: IComposer): Promise<IComposer | undefined> => {
  keypress.suspend();
  const responses = await inquirer.prompt([
    { 
      name: 'name', 
      type: 'input', 
      message: 'Name:', 
      default: known.name, 
      validate: (val) => !val ? 'Composer name is reuired' : (index[val] && index[val] !== existing) ? 'Composer name already in use' : true,
      askAnswered: true,
    },
    {
      name: 'born',
      type: 'input',
      message: 'Born:',
      default: known.born,
      validate: (val) => (!!val && dayjs(val).year != NaN) ? true : 'Invalid date',
      askAnswered: true,
    },
    {
      name: 'died',
      type: 'input',
      message: 'Died (blank if still living):',
      default: known.died,
      validate: (val) => (!val || dayjs(val).year != NaN) ? true : 'Invalid date',
      askAnswered: true,
    },
    {
      name: 'action',
      type: 'list',
      message: 'How does it look?',
      choices: ['OK', 'Redo', 'Cancel'],
      default: 'OK',
      askAnswered: true,
    }
  ]);
  keypress.resume();
  const aliases = known.aliases ?? [] as string[];
  const newVersion = {
    name: responses.name,
    aliases: (known.name && known.name !== responses.name) ? _.uniq([ ...aliases, known.name]) : aliases,
    born: responses.born,
    died: responses.died,
  };
  switch (responses.action) {
    case 'OK':
      return newVersion;

    case 'Redo':
      return getValues(newVersion, index, existing);
  }
  return undefined;
};

const isAnon = (name: string | undefined) => !name || name === 'Anonymous' || name === 'Traditional' || name === 'Traditionnel';

export const resolveAll = async () => {
  const index = indexComposers();
  const tracks = track.fetchAll();
  const tracksSansComposer = tracks.filter((t) => isAnon(t.composerKey));
  const anonToResolve = tracksSansComposer.filter((t) => !t.compositionDate);
  const tracksToResolve = _.difference(tracks, tracksSansComposer).filter((t) => t.composerKey && !index[t.composerKey]);
  const byComposer = _.groupBy(tracksToResolve, 'composerKey');
  const names = Object.keys(byComposer);
  notification(`${pluralize('composer', names.length, true)} to resolve, ${pluralize('track', anonToResolve.length, true)} with no composer and no composition date`);
  await names.sort().reduce(async (acc, name) => {
    await acc;
    await resolve(name, byComposer[name]);
  }, Promise.resolve());
  printLn('');
  notification('Anonymous works');
  await anonToResolve.reduce(async (acc, t) => {
    await acc;
    await track.resolveAnonymous(t);
  }, Promise.resolve());
};

export const resolve = async (name: string, tracks: track.ITrack[]): Promise<boolean> => {
  printLn('');
  const index = indexComposers();
  if (index[name]) {
    warning(`Found ${name} -- skipping`);
    return true;
  }
  const options = [VIEW, ADD, SKIP, ...suggest(name).map((s) => s.composer.name)];
  const { option } = await inquirer.prompt([
    {
      name: 'option',
      type: 'list',
      default: SKIP,
      choices: options,
      message: name,
    }
  ]);
  notification(option);
  switch (option) {
    case SKIP: {
      return false;
    }

    case ADD: {
      const composer = await getValues({ name }, index);
      return composer && add(composer) || resolve(name, tracks);
    }

    case VIEW: {
      notification(tracks.map((t) => _.pick(t, ['title', 'album', 'artists'])));
      return resolve(name, tracks);
    }

    default: {
      const composer = index[option];
      if (composer) {
        update({ name: composer.name, aliases: _.uniq([...composer.aliases || [], name]) });
      } else {
        error(`Could not find existing composer ${option}`);
      }
      break;
    }
  }
  return false;
};

export const formatInfo = (composer?: string[], composerKey?: string) => {
  const name = composer?.join(' & ') ?? composerKey ?? '?';
  const c = composerKey ? find(composerKey) : undefined;
  const aliases = [
    (c?.name !== name) ? c?.name : undefined,
    ...(c?.aliases.filter((a) => a !== composerKey) ?? []),
  ].filter((a) => !!a);
  return `Composer: ${name}${aliases.length > 0 ? ' (' + aliases.join(', ') + ')' : ''}, born: ${c?.born ?? '?'}${c?.died ? ' died: ' + c?.died : ''}`;
}
