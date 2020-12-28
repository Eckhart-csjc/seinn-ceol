import * as fs from 'fs';
import * as _ from 'lodash';
import * as mm from 'music-metadata';
import * as path from 'path';
import { ArrayFileHandler } from './array-file-handler';

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
}

export interface ITrackUpdater extends Partial<ITrack> {
  trackPath: string;
}

const trackFile = new ArrayFileHandler<ITrack>('tracks.json');

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

const makeTrack = async (trackPath: string, info?: ITrackInfo): Promise<ITrack> => {
  const trackInfo = info ?? await getInfo(trackPath);
  return {
    trackPath,
    ...trackInfo,
    composerKey: trackInfo.composer?.join(' & '),
    plays: 0,
  };
};

const findTrack = (trackPath: string) => {
  const tp = path.resolve(trackPath);
  return _.find(trackFile.fetch(), (track) => track.trackPath === tp);
};

const addTracks = async (tracks: string[]): Promise<ITrack[]> => {
  const existing = trackFile.fetch();
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
  const tracks = trackFile.fetch();
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
