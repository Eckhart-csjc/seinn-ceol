import * as _ from 'lodash';

import { ArrayFileHandler } from './array-file-handler';
import * as diagnostics from './diagnostics';
import { extract, parseExtractor, parseTags } from './extractor';
import * as keypress from './keypress';
import { ITagable } from './query';
import * as track from './track';
import { ask, error, merge, notification, printLn, warning } from './util';

const dayjs = require('dayjs');
const levenshtein = require('js-levenshtein');
const pluralize = require('pluralize');

export interface ICatalog {
  symbol: string;             // BWV, etc (without period, case inconsequential)
  aliases?: string[];         // Other symbols used for this catalog
  pattern?: string;           // Regex pattern:  If not provided, construct from symbol -- use named capture groups:
                              // "category" => optional category
                              // "n" => number (required)
                              // "prefix" => optional prefix
                              // "suffix" => optional suffix
                              // "symbol" => optional symbol (defaults to symbol member on match)
  isCategoryRoman?: boolean;  // category, if found, is a Roman numeral (thanks, Hoboken)
}

export interface IComposer extends ITagable {
  name: string;                // Name as key
  aliases: string[];           // Other ways of representing name
  born: string | number;       // Valid dayjs input
  died?: string | number;      // Valid dayjs input, or undefined is still living
  catalogs?: ICatalog[];       // Catalogs to look for in this composer's titles
}

export interface IComposerUpdater extends Partial<IComposer> {
  name: string;
}

const ADD = '<add new>';
const SKIP = '<skip for now>';
const VIEW = '<view tracks>';

let theFile: ArrayFileHandler<IComposer> | undefined;
const composerFile = () => theFile ||= new ArrayFileHandler<IComposer>('composers.json');

export const fetchAll = () => composerFile().fetch();

export const filter = (where?: string): IComposer[] => {
  const token = where && parseExtractor(where);
  if (where && !token) {
    return [];      // A Parse error occurred
  }
  const composers = fetchAll();
  return token ?
    composers.filter((t) => !!extract(t, token)) :
    composers;
};

let indexCache: Record<string, IComposer> | undefined;
let indexLast: IComposer[] | undefined;

export const composerIndexCacheStats: diagnostics.ICacheStats = {
  stores: 0,
  hits: 0,
  misses: 0,
};

export const indexComposers = (composers?: IComposer[]) => {
  const statIndex = diagnostics.startTiming('Index composers');
  const fetched = composers ?? fetchAll();
  if (!indexCache || fetched !== indexLast) {    // Not the same cached array
    composerIndexCacheStats.misses++;
    const index = fetched.reduce<Record<string,IComposer>>((accum, composer) => ({
       ...accum,
       [composer.name]: composer,
       ...composer.aliases.reduce<Record<string,IComposer>>((ac, alias) => ({ ...ac, [alias]: composer }), {} as Record<string,IComposer>),
    }), {} as Record<string,IComposer>);
    indexLast = fetched;
    indexCache = index;
    composerIndexCacheStats.stores++;
  } else {
    composerIndexCacheStats.hits++;
  }
  diagnostics.endTiming(statIndex);
  return indexCache;
};

export const find = (name: string, composers?: IComposer[]) => indexComposers(composers)[name];

const splitWords = (s: string) => s.split(/[ \-&,]/);

const getDistance = (a: string, b: string) => {
  const bw = splitWords(b).filter((w) => !!w);
  const scores = _.flatten(splitWords(a).filter((w) => !!w).map((w) => bw.map((w2) => levenshtein(w, w2)))).sort();
  const score = scores.slice(0, 2).reduce((acc, s) => acc + s, 0) / 2;
  return score;
};

const getBestDistance = (name: string, composer: IComposer) => {
  const distances = [ getDistance(name, composer.name), ...composer.aliases.map((alias) => getDistance(name, alias)) ];
  const best = distances.sort()[0];
  return best;
};

export const suggest = (name: string) => _.sortBy(fetchAll().map((composer: IComposer) => ({
  distance: getBestDistance(name, composer),
  composer,
})), ['distance']);

const checkAliases = (composer: IComposer, composers: IComposer[], newAliases: string[] = []) => {
  const index = indexComposers(composers);
  return [ ...composer.aliases, ...newAliases].map<IComposer | undefined>((alias) => index[alias]).filter((c) => !!c && c !== composer);
};

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
  composerFile().save([...composers, composer]);
  return true;
};

export const updateComposer = (updates: IComposerUpdater): boolean => {
  const composers = fetchAll();
  const existing = find(updates.name, composers);
  if (!existing) {
    error(`No composer named ${updates.name} found to update`);
    return false;
  }
  if (updates.aliases) {
    const existingAliases = checkAliases(existing, composers, updates.aliases);
    if (existingAliases.length > 0) {
      error(`The following aliases for this composer already exist`, existingAliases);
      return false;
    }
  }
  merge(existing, updates);
  composerFile().save(composers);
  return true;
};

export const updateComposers = (updates: IComposerUpdater[]): IComposer[] => {
  const composers = fetchAll();
  const updated = updates.reduce((accum, u) => {
    const existing = find(u.name, composers);
    if (!existing) {
      error(`No composer named ${u.name} found to update`);
      return accum;
    }
    if (u.aliases) {
      const existingAliases = checkAliases(existing, composers, u.aliases);
      if (existingAliases.length > 0) {
        error(`The following aliases for this composer already exist`, existingAliases);
        return accum;
      }
    }
    return [ ...accum, merge(existing, u) ];      // NOTE: merge mutates existing
  }, [] as IComposer[]);
  composerFile().save(composers);
  return updated;
};

export const update = (updates: object[]) => updateComposers(updates as IComposerUpdater[]);

const getValues = async (known: Partial<IComposer>, index: Record<string, IComposer>, existing?: IComposer): Promise<IComposer | undefined> => {
  keypress.suspend();
  const responses = await ask([
    {
      name: 'name',
      type: 'input',
      message: 'Name:',
      default: known.name,
      validate: (val: string) => !val ? 'Composer name is required' : (index[val] && index[val] !== existing) ? 'Composer name already in use' : true,
      askAnswered: true,
    },
    {
      name: 'born',
      type: 'input',
      message: 'Born:',
      default: known.born,
      validate: (val: string) => (!!val && dayjs(val).year != NaN) ? true : 'Invalid date',
      askAnswered: true,
    },
    {
      name: 'died',
      type: 'input',
      message: 'Died (blank if still living):',
      default: known.died,
      validate: (val: string) => (!val || dayjs(val).year != NaN) ? true : 'Invalid date',
      askAnswered: true,
    },
    {
      name: 'tags',
      type: 'input',
      message: 'Tags:',
      default: known.tags,
      validate: (val: string) => !!parseTags(val),
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
    tags: parseTags(responses.tags),
  };
  switch (responses.action) {
    case 'OK':
      return newVersion;

    case 'Redo':
      return getValues(newVersion, index, existing);
  }
  return undefined;
};

const isAnon = (name: string | undefined) => !name || name === 'Anonymous' || name === 'Traditional' || name === 'Traditionnel' || name === 'Unknown' || name === 'Composer Unknown';

export const cmdResolveComposers = async () => {
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
  if (anonToResolve.length) {
    printLn('');
    notification('Anonymous works');
    await anonToResolve.reduce(async (acc, t) => {
      await acc;
      await track.resolveAnonymous(t);
    }, Promise.resolve());
  }
};

export const resolve = async (name: string, tracks: track.ITrack[]): Promise<boolean> => {
  printLn('');
  const index = indexComposers();
  if (index[name]) {
    warning(`Found ${name} -- skipping`);
    return true;
  }
  const options = [VIEW, ADD, SKIP, ...suggest(name).map((s) => s.composer.name)];
  const { option } = await ask([
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
        updateComposer({ name: composer.name, aliases: _.uniq([...composer.aliases || [], name]) });
      } else {
        error(`Could not find existing composer ${option}`);
      }
      break;
    }
  }
  return false;
};

export const getCacheStats = () => composerFile().getCacheStats();
