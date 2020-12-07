import * as _ from 'lodash';
import * as mm from 'music-metadata';
import { execWithProgress } from './asyncChild';

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

export const makeTime = (milli: number) => `${Math.floor(milli / 60000)}:${("0" + Math.floor(milli / 1000) % 60).substr(-2)}`; 

export const play = async (track: string) => {
  const info = await getInfo(track);
  const total = (info.duration || 1) * 1000;
  const totalFmt = makeTime(total);
  console.log(` ${info.composer?.join(' and ')}: ${info.title}`);
  try {
    await doPlay(track, (elapsed: number) => {
      process.stdout.write(` ${makeTime(elapsed)} of ${totalFmt} (${Math.floor(elapsed * 100 / total)}%)`);
      process.stdout.cursorTo(0);
    });
  } catch (e) {
    console.error(`Error playing track ${track}: ${e.message}`);
  }
};

export const doPlay = async (track: string, notifyFunc: (elapsed:number) => void | Promise<void>) => {
  execWithProgress(`/usr/bin/afplay "${track.replace(/"/g, '\\"')}"`, notifyFunc);
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
