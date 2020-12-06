import * as _ from 'lodash';
import * as mm from 'music-metadata';
const execPromise = require('child-process-promise').exec;

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

export const play = async (track: string) => {
  const result = await execPromise(`/usr/bin/afplay ${track}`)
    .catch((caught: Error) => ({ error: caught }));
  if (result.error) {
    console.error(`Error playing track ${track}: ${result.error.message}`);
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
