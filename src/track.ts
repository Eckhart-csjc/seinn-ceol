import * as fs from 'fs';
import * as inquirer from 'inquirer';
import * as _ from 'lodash';
import * as mm from 'music-metadata';
import * as path from 'path';
import { ArrayFileHandler } from './array-file-handler';
import * as composer from './composer';
import { IComposer } from './composer';
import * as keypress from './keypress';
import { play } from './play';
import { makeTime } from './util';

const dayjs = require('dayjs');

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
  compositionDate?: string;
}

export interface ITrackSort extends Omit<ITrack, 'composerKey'> {
  composerKey?: Partial<IComposer>;
}

export interface ITrackStats {
  nTracks: number;
  totalTime: number;
}

export interface ITrackUpdater extends Partial<ITrack> {
  trackPath: string;
}

const trackFile = new ArrayFileHandler<ITrack>('tracks.json');

export const fetchAll = () => trackFile.fetch();

export const add = async (tracks:string[]) => {
  try {
    const newTracks = await addTracks(tracks);
    console.log(newTracks.map((track) => `Added "${track.title}"`).join("\n"));
  } catch (e) {
    console.error(`Error adding tracks: ${e.message}`);
  }
};

export const info = async (track:string) => {
  try {
    const tags = await getInfo(track);
    console.log(tags);
  } catch (e) {
    console.error(`Error retrieving info from track ${track}: ${e.message}`);
  }
};

export const getInfo = async (track:string) : Promise<ITrackInfo> => {
  const p = await mm.parseFile(track);
  const c = p.common;
  return {
    track: c.track.no || undefined,
    nTracks: c.track.of || undefined,
    disk: c.disk.no || undefined,
    nDisks: c.disk.of || undefined,
    ..._.pick(c, ['title','artists','composer','album','grouping','genre','year','date','copyright']),
    duration: p.format.duration,
  };
}

export const stats = (tracks?: ITrack[]): ITrackStats => (tracks ?? fetchAll()).reduce<ITrackStats>((accum, track) => ({
  nTracks: accum.nTracks + 1,
  totalTime: accum.totalTime + (track.duration ?? 0),
}), {
  nTracks: 0,
  totalTime: 0,
});

export const makeTrack = async (trackPath: string, info?: ITrackInfo): Promise<ITrack> => {
  const trackInfo = info ?? await getInfo(trackPath);
  return {
    trackPath,
    ...trackInfo,
    composerKey: trackInfo.composer?.join(' & '),
    plays: 0,
  };
};

export const findTrack = (trackPath: string) => {
  const tp = path.resolve(trackPath);
  return _.find(fetchAll(), (track) => track.trackPath === tp);
};

const addTracks = async (tracks: string[]): Promise<ITrack[]> => {
  const existing = fetchAll();
  const newTracks = await tracks.reduce<Promise<ITrack[]>>(async (acc, track) => {
    const accum = await acc;
    const trackPath = path.resolve(track);
    if (_.find(accum, (e) => e.trackPath === trackPath)) {
      console.log(`Track ${trackPath} previously added -- skipped`);
      return accum;
    } else {
      return [
        ...accum,
        await makeTrack(trackPath),
      ];
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
    console.warn(`Track "${updates.trackPath}" not in library -- not updating`);
  }
};

export const bumpPlays = (trackPath: string) => {
  const oldTrack = findTrack(trackPath);
  if (oldTrack) {
    updateTrack({
      trackPath: oldTrack.trackPath,
      plays: oldTrack.plays + 1,
    });
  }
};

export const makeTrackSort = (
  t: ITrack, 
  composerIndex?: Record<string, IComposer>
): ITrackSort => {
    const c = t.composerKey && (t.composerKey !== 'Anonymous') ? 
      (composerIndex ? composerIndex[t.composerKey] : composer.find(t.composerKey)) : 
      undefined;
    const composerKey = (c ? {
        ..._.omit(c, ["born", "died"]),
        born: new Date(dayjs(c.born)).getTime(),
        died: new Date(dayjs(c.died)).getTime(),
      } : undefined) ?? {
        name: t.composerKey ?? 'Anonymous',
        born: new Date(dayjs(t.compositionDate)).getTime(),
        died: new Date(dayjs(t.compositionDate)).getTime(),
      };
    return {
      ..._.omit(t, 'composerKey'),
      composerKey
    };
};

export const sort = (sortKeys: string[]): ITrackSort[] => {
  const composerIndex = composer.indexComposers();
  return _.sortBy(
    fetchAll().map((t) => makeTrackSort(t, composerIndex)),
    sortKeys,
  );
};

export const resolveAnonymous = async (track: ITrack) => {
  console.log('');
  console.log(_.pick(track, ['title', 'album', 'artists']));
  const SKIP = 'skip for now';
  const COMPOSER = 'enter composer name';
  const DATE = 'enter composition date';
  const options = [SKIP, COMPOSER, DATE];
  const { option } = await inquirer.prompt([
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

    case COMPOSER: {
      keypress.suspend();
      const { composerKey } = await inquirer.prompt([
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
    };

    case DATE: {
      keypress.suspend();
      const { compositionDate } = await inquirer.prompt([
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
  ...(t.date ? [ `Date: ${t.date}` ] : []),
  `Duration: ${makeTime((t.duration ?? 1) * 1000)}`,
  `Plays: ${t.plays}`,
];
