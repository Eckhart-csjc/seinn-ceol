import * as fs from 'fs';
import * as _ from 'lodash';
import * as mm from 'music-metadata';
import * as path from 'path';
import { ArrayFileHandler } from './array-file-handler';
import * as composer from './composer';
import { IComposer } from './composer';
import * as diagnostics from './diagnostics';
import * as keypress from './keypress';
import { doPlay, stopPlaying } from './play';
import { 
  addProgressSuffix, 
  ask, 
  error, 
  makeProgressBar,
  makeTime, 
  normalizePath,
  notification, 
  print,
  printColumns,
  printLn, 
  removeProgressSuffix, 
  sortBy,
  warning 
} from './util';
import { extract, parseExtractor } from './extractor';

const dayjs = require('dayjs');
const pluralize = require('pluralize');

export interface ITrackInfo {
  track?: number;
  nTracks?: number;
  disk?: number;
  nDisks?: number;
  title?: string;
  artists?: string[];
  composer?: string[];
  album?: string;
  grouping?: string;
  genre?: string[];
  year?: number;
  date?: string;
  copyright?: string;
  duration?: number;
}

export interface ITrack extends ITrackInfo {
  trackPath: string;
  composerKey?: string;
  lastPlayed?: string;
  compositionDate?: string;
  opus?: number;        // Parsed from track title
  no?: number;          // Parsed number from track title
  movement?: number;    // Parsed roman numeral movement number from title
  subMovement?: string; // Parsed single-letter submovement from title
  catalogs?: ICatalogEntry[]; // Parsed from title, based on composerDetail.catalogs, first one found (in composer order) is [0], etc.
  plays: number;
  playTime?: number;
}

export interface ICatalogEntry {
  symbol: string;               // Symbol in composerDetail.catalogs
  index: number;                // Index of symbol in composerDetail.catalogs
  category?: string | number;   // Any category within the catalog
  prefix?: string | number;     // Any prefix
  n: string | number;           // Catalog entry number
  suffix?: string | number;     // Any suffix
}

export interface ITrackHydrated extends ITrack {
  composerDetail?: IComposer;
  index?: number;       // Added by sort
  keys?: any[];         // Added by sort
}

export interface ITrackUpdater extends Partial<ITrack> {
  trackPath: string;
}

let theFile: ArrayFileHandler<ITrack> | undefined = undefined;

const trackFile = () => theFile ||= new ArrayFileHandler<ITrack>('tracks.json');

export const fetchAll = () => trackFile().fetch();

export const filter = (where?: string): ITrackHydrated[] => {
  const statFilter = diagnostics.startTiming('Filter tracks');
  const token = where && parseExtractor(where);
  if (where && !token) {
    return [];      // A Parse error occurred
  }
  const composerIndex = composer.indexComposers();
  const allTracks = fetchAll().map((t) => hydrateTrack(t, composerIndex));
  const result = token ?
    allTracks.filter((t) => !!extract(t, token)) :
    allTracks;
  diagnostics.endTiming(statFilter);
  return result;
};

export const saveAll = (tracks: ITrack[]) => trackFile().save(tracks);

export const cmdAdd = async (tracks:string[], options: { noError: boolean, noWarn: boolean }) => {
  try {
    const newTracks = await addTracks(tracks, options.noWarn, options.noError);
    printColumns([
      ['Composer', 'Title'],
      ...newTracks.map((track) => 
        [track.composer?.join(' & ') || 'Anonymous', track.title ?? '']
      ),
    ], undefined, true, 1);
    notification(`${pluralize('track', newTracks.length, true)} added`);
  } catch (e) {
    error(`Error adding tracks: ${e.message}`);
  }
};

const gatherFiles = (dir: string): string[] => {
  try {
    const entries = fs.readdirSync(dir);
    return entries.reduce((accum, file, ndx) => {
      const fullName = path.resolve(dir, file);
      const stat = fs.statSync(fullName);
      return stat.isDirectory() ?
        [ ...accum, ...gatherFiles(fullName) ] :
        (stat.isFile() ? [ ...accum, fullName ] : accum);
    }, [] as string[]);
  } catch (e) {
    error(`Could not read directory ${dir}: ${e.message}`);
    return [];
  }
}

export const cmdAddAll = async (directory: string, options: { noError: boolean, noWarn: boolean }) => 
  cmdAdd(gatherFiles(normalizePath(directory)), options);

export const cmdInfo = async (track:string) => {
  try {
    const tags = await getInfo(track);
    notification(tags);
  } catch (e) {
    error(`Error retrieving info from track ${track}: ${e.message}`);
  }
};

export const getInfo = async (track:string) : Promise<ITrackInfo> => {
  const p = await mm.parseFile(track);
  const c = _.mapValues(p.common, (v) => (typeof v === 'string') ? v.normalize() : v) as any;
  return {
    track: c.track.no || undefined,
    nTracks: c.track.of || undefined,
    disk: c.disk.no || undefined,
    nDisks: c.disk.of || undefined,
    ..._.pick(c, ['title','artists','composer','album','grouping','genre','year','date','copyright']),
    duration: p.format.duration,
  };
}

export const maybeCorrectTrack = (t: ITrack) => {
  const basename = path.basename(t.trackPath);
    const m1 = basename.match(/^(\d*)(?:-(\d*))? /);
    const [d, tr] = m1 ? (
    m1[2] ?
      [ parseInt(m1[1], 10), parseInt(m1[2], 10) ] :
      [ t.nDisks ? 1 : undefined, parseInt(m1[1], 10) ]
  ) : [ (t.disk ?? (t.nDisks ? 1 : undefined)), (t.track ?? 1) ];
  const composer = removeDupNames(t.composer);
  const artists = removeDupNames(t.artists);
  if (d != t.disk || tr != t.track) {
    notification(d ?
      `${basename}: correcting disk:track from ${t.disk}:${t.track} to ${d}:${tr}` :
      `${basename}: correcting track from ${t.track} to ${tr}`);
    return {
      ...t,
      disk: d,
      track: tr,
      composer,
      artists,
    }
  }
  return {
    ...t,
    composer,
    artists,
  };
}

// Some m4a sources provide conposer and artist names duplicated with &
const removeDupNames = (names?: string[]) =>
  names &&
    _.uniq(
      names.map((n) => (n.match(/^([A-Z].*) & \1$/))?.[1] ?? n)
    );

export const makeTrack = async (trackPath: string, info?: ITrackInfo): Promise<ITrack> => {
  const trackInfo = info ?? await getInfo(trackPath);
  return maybeCorrectTrack({
    trackPath,
    ...trackInfo,
    composerKey: _.uniq(removeDupNames(trackInfo.composer ?? [])).join(' & ') || undefined,
    opus: parseOpus(trackInfo.title),
    no: parseNo(trackInfo.title),
    movement: parseMovement(trackInfo.title),
    subMovement: parseSubMovement(trackInfo.title),
    plays: 0,
  });
};

export const migrateTrack = (t: ITrack, composerIndex: Record<string, IComposer>): ITrack => {
  const composerDetail = t.composerKey ? 
    (composerIndex ? composerIndex[t.composerKey] : composer.find(t.composerKey)) : 
    undefined;
  return {
    ...t,
    composerKey: t.composerKey || _.uniq(removeDupNames(t.composer ?? [])).join(' & ') || undefined,
    opus: t.opus ?? parseOpus(t.title),
    no: t.no ?? parseNo(t.title),
    movement: t.movement ?? parseMovement(t.title),
    subMovement: t.subMovement ?? parseSubMovement(t.title),
    catalogs: composerDetail?.catalogs?.reduce<ICatalogEntry[]>((accum, c, index) => {
      const pattern = new RegExp(c.pattern ?? `\\b(${[c.symbol, ...(c.aliases ?? [])].join('|')})\\.?\\s*(?<prefix>[A-Z])?(?<n>\\d+)(?<suffix>[a-z]*)?\\b`, 'i');
      const match = t.title?.match(pattern);
      return match?.groups ?
        [
          ...accum,
          {
            symbol: (match.groups.symbol || c.symbol),
            index,
            category: match.groups.category ?
              (c.isCategoryRoman ? parseRoman(match.groups.category) : intOrString(match.groups.category)) :
              undefined,
            prefix: intOrString(match.groups.prefix),
            n: intOrString(match.groups.n) ?? 0,
            suffix: intOrString(match.groups.suffix),
          }
        ] : accum;
    }, [] as ICatalogEntry[]),
    playTime: t.playTime ?? (t.duration ? (t.plays * t.duration) : undefined),
  };
};

export const migrateAllTracks = () => {
  const composerIndex = composer.indexComposers();
  saveAll(fetchAll().map((t) => migrateTrack(t, composerIndex)));
};

export const findTrack = (trackPath: string) => {
  const tp = normalizePath(trackPath);
  return _.find(fetchAll(), (track) => track.trackPath === tp);
};

const addTracks = async (
  tracks: string[], 
  noWarn?: boolean, 
  noError?: boolean
): Promise<ITrack[]> => {
  const existing = fetchAll();
  const byTrack = existing.reduce((acc, t) => { acc[t.trackPath] = t; return acc; }, {} as Record<string, ITrack>);
  const newTracks = await tracks.reduce<Promise<ITrack[]>>(async (acc, track, ndx) => {
    const accum = await acc;
    if (process.stdout.isTTY) {
      const pct = ndx / (tracks.length || 1);
      print(makeProgressBar(process.stdout.columns, pct, `Processed ${ndx} of ${pluralize('file', tracks.length, true)} (${Math.floor(pct * 100)}%)`));
      process.stdout.cursorTo(0);
    }
    const trackPath = normalizePath(track);
    if (byTrack[trackPath]) {
      if (!noWarn) {
        warning(`Track ${trackPath} previously added -- skipped`);
      }
      return accum;
    } else {
      try {
        const t = await makeTrack(trackPath, undefined);
        byTrack[trackPath] = t;
        return [
          ...accum,
          t,
        ];
      } catch (e) {
        if (!noError) {
          error(`Track ${trackPath} is not an audio file we can use`);
        }
        return accum;
      }
    }
  }, Promise.resolve(existing));
  if (process.stdout.isTTY) {
    process.stdout.clearLine(0);
  }
  const uniqd = _.uniqBy(newTracks, (t) => `${t.title}|${t.album}|${t.composer?.join('|')}`);
  trackFile().save(uniqd);
  return _.difference(uniqd, existing);
};

const updateTrack = (updates: ITrackUpdater) => {
  const tracks = fetchAll();
  const oldTrack = _.find(tracks, (track) => track.trackPath === updates.trackPath);
  if (oldTrack) {
    _.merge(oldTrack, updates);     // mutates oldTrack, and thus tracks (this is to maintain track order)
    trackFile().save(tracks);
  } else {
    warning(`Track "${updates.trackPath}" not in library -- not updating`);
  }
};

export const bumpPlays = (trackPath: string) => {
  const oldTrack = findTrack(trackPath);
  if (oldTrack) {
    updateTrack({
      trackPath: oldTrack.trackPath,
      plays: oldTrack.plays + 1,
      playTime: (oldTrack.playTime ?? 0) + (oldTrack.duration ?? 0),
      lastPlayed: dayjs().toString(),
    });
  }
};

export const parseOpus = (title?: string): number|undefined => {
  const match = title?.match(/\bOp(\.?|us)\s*(\d+)/i);
  return match ? parseInt(match[2], 10) : undefined;
};

export const parseNo = (title?: string): number|undefined => {
  const match = title?.match(/\bN(o\.?|umber)\s*(\d+)/i);
  return match ? parseInt(match[2], 10) : undefined;
};

export const parseMovement = (title?: string): number|undefined => {
  const match = title?.match(/:\s*([IVXLCDM]+)[a-z]?\./);
  return match?.[1] ? parseRoman(match[1]) : undefined;
};

export const parseSubMovement = (title?: string): string|undefined => {
  const match = title?.match(/:\s*[IVXLCDM]+([a-z])\./);
  return match?.[1];
};

const intOrString = (val: string | undefined) => val?.match(/^\d+$/) ? parseInt(val,10) : val;

const ROMAN: Record<string, number> = 
  {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000};

export const parseRoman = (val: string) => [...val].reduce<{prev: number, result: number}>((accum, c) => {
  const val = ROMAN[c] ?? 0;
  return {
    prev: val,
    result: (val > accum.prev) ? (accum.result - (accum.prev * 2) + val) : (accum.result + val)
  };
}, { prev: 0, result: 0 }).result;

export const hydrateTrack = (
  t: ITrack, 
  composerIndex?: Record<string, IComposer>
): ITrackHydrated => {
    const composerDetail = t.composerKey ? 
      (composerIndex ? composerIndex[t.composerKey] : composer.find(t.composerKey)) : 
      undefined;
    return {
      ...t,
      composerDetail,
      catalogs: t.catalogs ?? composerDetail?.catalogs?.reduce<ICatalogEntry[]>((accum, c, index) => {
        const pattern = new RegExp(c.pattern ?? `\\b(${[c.symbol, ...(c.aliases ?? [])].join('|')})\\.?\\s*(?<prefix>[A-Z])?(?<n>\\d+)(?<suffix>[a-z]*)?\\b`, 'i');
        const match = t.title?.match(pattern);
        return match?.groups ?
          [
            ...accum,
            {
              symbol: (match.groups.symbol || c.symbol),
              index,
              category: match.groups.category ?
                (c.isCategoryRoman ? parseRoman(match.groups.category) : intOrString(match.groups.category)) :
                undefined,
              prefix: intOrString(match.groups.prefix),
              n: intOrString(match.groups.n) ?? 0,
              suffix: intOrString(match.groups.suffix),
            }
          ] : accum;
      }, [] as ICatalogEntry[]),
    };
};

export const sort = (sortKeys: string[], whereClause?: string): ITrackHydrated[] => {
  const composerIndex = composer.indexComposers();
  const statSort = diagnostics.startTiming('Filter and sort tracks');
  const result = sortBy<ITrackHydrated>(filter(whereClause), sortKeys);
  diagnostics.endTiming(statSort);
  return result;
};

export const resolveAnonymous = async (track: ITrack): Promise<void> => {
  printLn('');
  notification(_.pick(track, ['title', 'album', 'artists', 'trackPath']));
  const SKIP = 'skip for now';
  const PLAY = 'play track';
  const COMPOSER = 'enter composer name';
  const DATE = 'enter composition date';
  const options = [SKIP, PLAY, COMPOSER, DATE];
  const { option } = await ask([
    {
      name: 'option',
      type: 'list',
      default: SKIP,
      choices: options,
    }
  ]);
  switch (option) {
    case SKIP:
      return;

    case PLAY: {
      const playKeys = keypress.makeKeys([{ 
        name: 'stop', 
        func: (k: keypress.IKey) => stopPlaying(),
        help: 'stop playing'
      }]);
      keypress.addKeys(playKeys);
      await doPlay(track, 0);
      keypress.removeKeys(playKeys);
      return resolveAnonymous(track);
    }

    case COMPOSER: {
      keypress.suspend();
      const { composerKey } = await ask([
        {
          name: 'composerKey',
          type: 'input',
          default: track.composerKey,
        }
      ]);
      keypress.resume();
      if (composerKey && composerKey !== track.composerKey) {
        updateTrack({ trackPath: track.trackPath, composerKey });
      }
      return;
    }

    case DATE: {
      keypress.suspend();
      const { compositionDate } = await ask([
        {
          name: 'compositionDate',
          type: 'input',
          default: track.compositionDate,
        }
      ]);
      keypress.resume();
      if (compositionDate && compositionDate !== track.compositionDate) {
        updateTrack({ trackPath: track.trackPath, compositionDate });
      }
      return;
    }
  }
}

export const formatInfo = (t: ITrackHydrated): string[] => [
  `Title: ${t.title || '?'}`,
  composer.formatInfo(t.composer, t.composerDetail),
  ...(t.compositionDate ? [ `Composition Date: ${t.compositionDate}` ] : []),
  `Album: ${t.album || '?'}`,
  ...((t.nDisks && t.nDisks > 1) ? [ `Disk ${t.disk} of ${t.nDisks}` ] : []),
  ...(t.nTracks ? [ `Track ${t.track} of ${t.nTracks}` ] : []),
  ...(t.artists ? [ `Artist: ${t.artists.join(' & ')}` ] : []),
  ...(t.date ? [ dayjs(t.date).format('MMMM D, YYYY') ] : []),
  ...(t.copyright ? [ t.copyright ] : []),
  ...(t.genre ? [ `Genre: ${t.genre.join(', ')}` ] : []),
  ...(t.opus ? [ `Opus ${t.opus}` ]: []),
  ...(t.catalogs && t.catalogs.length ?
    [ `${pluralize('Catalog', t.catalogs.length)}: ${t.catalogs.map((c) => c.symbol + ' ' + (c.category ? c.category + ':' : '') + (c.prefix ?? '') + c.n + (c.suffix ?? '')).join(', ')}` ] :
    []),
  ...(t.no ? [ `No. ${t.no}` ]: []),
  ...(t.movement ? [ `Movement ${t.movement}${t.subMovement ?? ''}` ]: []),
  `Duration: ${makeTime((t.duration ?? 1) * 1000)}`,
  `Plays: ${t.plays}`,
  ...(t.lastPlayed ? [`Last played: ${t.lastPlayed}`] : []),
  `Media file: ${t.trackPath}`,
];

export const cmdRemoveDeleted = async () => {
  const tracks = trackFile().fetch();
  const reduced = tracks.reduce((accum, t) => {
    try {
      fs.statSync(t.trackPath);
    } catch (e) {
      if (e.code === 'ENOENT') {
        notification(`Removing ${t.trackPath}`);
        return accum;
      } else {
        warning(`Could not stat ${t.trackPath} -- not removing
${e.message}`);
      }
    }
    return [...accum, t];
  }, [] as ITrack[]);
  if (reduced.length < tracks.length) {
    const { commit } = await ask({
      type: 'confirm',
      name: 'commit',
      message: 'Commit these changes?',
      default: false,
    });
    if (commit) {
      trackFile().save(reduced);
      notification(`Changes saved`);
    } else {
      notification(`Changes discarded`);
    }
  } else {
    notification(`No tracks to remove`);
  }
};

export const getCacheStats = () => trackFile().getCacheStats();
