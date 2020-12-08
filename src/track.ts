import * as _ from 'lodash';
import * as mm from 'music-metadata';
import { execWithProgress } from './asyncChild';
const chalk = require('chalk');

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

export const makeBar = (width: number, pct: number) => {
  const ticks = Math.floor(Math.max(0,Math.min(width, Math.floor(width * pct))));
  const togo = width - ticks;
  const shade = '\u2592';
  return `${ticks ? chalk.inverse(' '.repeat(ticks)) : ''}${togo ? shade.repeat(togo) : ''}`;
};

export const play = async (track: string) => {
  const info = await getInfo(track);
  const total = (info.duration || 1) * 1000;
  const totalFmt = makeTime(total);
  const maxWidth = process.stdout.columns || 80;
  const barWidth = maxWidth - 24;
  console.log(` ${info.composer?.join(' and ')}: ${info.title} - ${info.artists?.join(' and ')}`.slice(-maxWidth));
  try {
    await doPlay(track, (elapsed: number) => {
      const pct = elapsed / total;
      process.stdout.write(` ${makeBar(barWidth, pct)} ${makeTime(elapsed)} of ${totalFmt} (${Math.floor(pct * 100)}%)`);
      process.stdout.cursorTo(0);
    });
  } catch (e) {
    console.error(`Error playing track ${track}: ${e.message}`);
  }
};

export const doPlay = async (track: string, notifyFunc: (elapsed:number) => void | Promise<void>) => {
  return execWithProgress(`/usr/bin/afplay -q 1 "${track.replace(/"/g, '\\"')}"`, notifyFunc);
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
