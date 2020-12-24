import * as fs from 'fs';
import * as _ from 'lodash';
import * as mm from 'music-metadata';
import * as os from 'os';
import * as path from 'path';

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

const getDefaultPath = () => {
  const folderPath = path.resolve(os.homedir(), './Music/seinn-ceol');
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true, mode: 0o744 });
  }
  return folderPath;
};

const makeFilename = (basename: string, pathOverride?: string) => path.resolve(path.join(pathOverride ?? getDefaultPath(), basename));

const fetchTracks = (pathOverride?: string): ITrack[] => {
  const trackFilename = makeFilename('tracks.json', pathOverride);
  if (fs.existsSync(trackFilename)) {
    return JSON.parse(fs.readFileSync(trackFilename, { encoding: 'utf8' })) as ITrack[];
  }
  return [];
};

const findTrack = (trackPath: string, pathOverride?: string) => {
  const tp = path.resolve(trackPath);
  return _.find(fetchTracks(pathOverride), (track) => track.trackPath === tp);
};

const writeTracks = (tracks: ITrack[], pathOverride?: string) => {
  const trackFilename = makeFilename('tracks.json', pathOverride);
  const tmpFilename = `${trackFilename}.tmp`;
  if (fs.existsSync(tmpFilename)) {
    fs.rmSync(tmpFilename);
  }
  fs.appendFileSync(tmpFilename, JSON.stringify(tracks, undefined, 2), { encoding: 'utf8' });
  fs.renameSync(tmpFilename, trackFilename);
};

const addTracks = async (tracks: string[], pathOverride?: string): Promise<ITrack[]> => {
  const existing = fetchTracks(pathOverride);
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
  writeTracks(newTracks);
  return _.difference(newTracks, existing);
};

const updateTrack = (updates: ITrackUpdater, pathOverride?: string) => {
  const tracks = fetchTracks(pathOverride);
  const oldTrack = _.find(tracks, (track) => track.trackPath === updates.trackPath);
  if (oldTrack) {
    _.merge(oldTrack, updates);     // mutates oldTrack, and thus tracks (this is to maintain track order)
    writeTracks(tracks);
  } else {
    console.warn(`Track "${updates.trackPath}" not in library -- not updating`);
  }
};

export const bumpPlays = (trackPath: string, pathOverride?: string) => {
  const oldTrack = findTrack(trackPath, pathOverride);
  if (oldTrack) {
    updateTrack({
      trackPath: oldTrack.trackPath,
      plays: oldTrack.plays + 1,
    });
  }
};
