import * as fs from 'fs';
import * as _ from 'lodash';
import * as mm from 'music-metadata';
import * as path from 'path';
import { ArrayFileHandler } from './array-file-handler';
import * as composer from './composer';
import { IComposer } from './composer';
import * as keypress from './keypress';
import { doPlay, stopPlaying } from './play';
import { 
  addProgressSuffix, 
  ask, 
  error, 
  makeTime, 
  notification, 
  printColumns,
  printLn, 
  removeProgressSuffix, 
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
  plays: number;
  lastPlayed?: string;
  compositionDate?: string;
}

export interface ITrackHydrated extends ITrack {
  composerDetail?: IComposer;
  playTime?: number;
}

export interface ITrackDisplay {
  index: number;
  track: string;     // N of M
  disk: string;      // N of M
  title: string;
  artists: string;   // A [& B]...
  composer: string;  // A [& B]...
  composerKey: string;
  composerName: string;
  composerBorn: string;
  composerDied: string;
  album: string;
  genre: string;
  year: string;
  date: string;
  copyright: string;
  duration: string;
  plays: string;
  lastPlayed: string;
  playTime: string;
}

export interface ITrackUpdater extends Partial<ITrack> {
  trackPath: string;
}

const trackFile = new ArrayFileHandler<ITrack>('tracks.json');

export const fetchAll = () => trackFile.fetch();

export const filter = (where?: string): ITrackHydrated[] => {
  const token = where && parseExtractor(where);
  if (where && !token) {
    return [];      // A Parse error occurred
  }
  const composerIndex = composer.indexComposers();
  const allTracks = fetchAll().map((t) => hydrateTrack(t, composerIndex));
  return token ?
    allTracks.filter((t) => !!extract(t, token)) :
    allTracks;
};

export const saveAll = (tracks: ITrack[]) => trackFile.save(tracks);

export const add = async (tracks:string[], options: { noError: boolean, noWarn: boolean }) => {
  try {
    const newTracks = await addTracks(tracks, options.noWarn, options.noError);
    printColumns(newTracks.map((track) => 
      [track.composer?.join(' & ') || 'Anonymous', track.title ?? '']
    ), undefined, true);
    notification(`${pluralize('track', newTracks.length, true)} added`);
  } catch (e) {
    error(`Error adding tracks: ${e.message}`);
  }
};

const gatherFiles = (dir: string, incoming: string[] = []): string[] => {
  try {
    const entries = fs.readdirSync(dir);
    return entries.reduce((accum, file) => {
      const fullName = path.resolve(dir, file);
      const stat = fs.statSync(fullName);
      return stat.isDirectory() ?
        [ ...accum, ...gatherFiles(fullName) ] :
        (stat.isFile() ? [ ...accum, fullName ] : accum);
    }, incoming);
  } catch (e) {
    error(`Could not read directory ${dir}: ${e.message}`);
    return incoming;
  }
}

export const addAll = async (directory: string, options: { noError: boolean, noWarn: boolean }) => 
  add(gatherFiles(path.resolve(directory)), options);

export const info = async (track:string) => {
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
  if (d != t.disk || tr != t.track) {
    notification(d ?
      `${basename}: correcting disk:track from ${t.disk}:${t.track} to ${d}:${tr}` :
      `${basename}: correcting track from ${t.track} to ${tr}`);
    return {
      ...t,
      disk: d,
      track: tr,
    }
  }
  return t;
}

export const makeTrack = async (trackPath: string, info?: ITrackInfo): Promise<ITrack> => {
  const trackInfo = info ?? await getInfo(trackPath);
  return maybeCorrectTrack({
    trackPath,
    ...trackInfo,
    composerKey: _.uniq(trackInfo.composer && []).join(' & ') || undefined,
    plays: 0,
  });
};

export const findTrack = (trackPath: string) => {
  const tp = path.resolve(trackPath);
  return _.find(fetchAll(), (track) => track.trackPath === tp);
};

const addTracks = async (
  tracks: string[], 
  noWarn?: boolean, 
  noError?: boolean
): Promise<ITrack[]> => {
  const existing = fetchAll();
  const newTracks = await tracks.reduce<Promise<ITrack[]>>(async (acc, track) => {
    const accum = await acc;
    const trackPath = path.resolve(track.normalize());
    if (_.find(accum, (e) => e.trackPath === trackPath)) {
      if (!noWarn) {
        warning(`Track ${trackPath} previously added -- skipped`);
      }
      return accum;
    } else {
      try {
        const t = await makeTrack(trackPath, undefined);
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
  trackFile.save(newTracks);
  return _.difference(newTracks, existing);
};

const updateTrack = (updates: ITrackUpdater) => {
  const tracks = fetchAll();
  const oldTrack = _.find(tracks, (track) => track.trackPath === updates.trackPath);
  if (oldTrack) {
    _.merge(oldTrack, updates);     // mutates oldTrack, and thus tracks (this is to maintain track order)
    trackFile.save(tracks);
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
      lastPlayed: dayjs().toString(),
    });
  }
};

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
      playTime: t.duration ? (t.plays * t.duration) : undefined,
    };
};

export const sort = (sortKeys: string[], whereClause?: string): ITrackHydrated[] => {
  const composerIndex = composer.indexComposers();
  const sortParsers = sortKeys.map((k) => parseExtractor(k)).filter((p) => !!p);
  return _.sortBy(
    filter(whereClause).map((t) => hydrateTrack(t, composerIndex)),
    sortParsers.map((p) => (t:ITrackHydrated) => extract(t, p!)),
  );
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

export const formatInfo = (t: ITrack): string[] => [
  `Title: ${t.title || '?'}`,
  composer.formatInfo(t.composer, t.composerKey),
  ...(t.compositionDate ? [ `Composition Date: ${t.compositionDate}` ] : []),
  `Album: ${t.album || '?'}`,
  ...((t.nDisks && t.nDisks > 1) ? [ `Disk ${t.disk} of ${t.nDisks}` ] : []),
  ...(t.nTracks ? [ `Track ${t.track} of ${t.nTracks}` ] : []),
  ...(t.artists ? [ `Artist: ${t.artists.join(' & ')}` ] : []),
  ...(t.date ? [ dayjs(t.date).format('MMMM D, YYYY') ] : []),
  ...(t.copyright ? [ t.copyright ] : []),
  ...(t.genre ? [ `Genre: ${t.genre.join(', ')}` ] : []),
  `Duration: ${makeTime((t.duration ?? 1) * 1000)}`,
  `Plays: ${t.plays}`,
  ...(t.lastPlayed ? [`Last played: ${t.lastPlayed}`] : []),
  `Media file: ${t.trackPath}`,
];

const makeDateDisplay = (input: string | number | undefined) =>
  input ?
    ((typeof input === 'string' && input.length <= 8) ? input : dayjs(input).format('YYYY-MM-DD'))
  : '';

const makeLastPlayedDisplay = (input?: string) => {
  if (input) {
    const dt = dayjs(input);
    const now = dayjs();
    return (now.diff(dt, 'years') > 0) ?
      dt.format('YYYY MMM D') :
      (now.diff(dt, 'days') > 0) ?
        dt.format('MMM D') :
        dt.format('H:MMa');
  }
  return '';
}

export const makeDisplay = (t: ITrackHydrated, index: number): ITrackDisplay => {
  return {
    index,
    track: t.track ? `${t.track}${t.nTracks ? '/'+t.nTracks : ''}` : '',
    disk: t.disk ? `${t.disk}${t.nDisks ? '/'+t.nDisks : ''}` : '',
    title: t.title ?? '',
    artists: t.artists?.join(' & ') ?? '',
    composer: t.composer?.join(' & ') || t.composerKey || '',
    composerKey: t.composerKey ?? '',
    composerName: t.composerDetail?.name ?? '',
    composerBorn: makeDateDisplay(t.composerDetail?.born),
    composerDied: makeDateDisplay(t.composerDetail?.died),
    album: t.album ?? '',
    genre: t.genre?.join(', ') ?? '',
    year: `${t.year ?? ''}`,
    date: makeDateDisplay(t.date),
    copyright: t.copyright ?? '',
    duration: t.duration ? makeTime(t.duration * 1000) : '',
    plays: `${t.plays || 0}`,
    lastPlayed: makeLastPlayedDisplay(t.lastPlayed),
    playTime: t.playTime ? makeTime(t.playTime * 1000) : '',
  };
};

export const removeDeleted = async () => {
  const tracks = trackFile.fetch();
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
      trackFile.save(reduced);
      notification(`Changes saved`);
    } else {
      notification(`Changes discarded`);
    }
  } else {
    notification(`No tracks to remove`);
  }
};
