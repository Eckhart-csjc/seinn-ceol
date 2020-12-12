import * as _ from 'lodash';
import * as mm from 'music-metadata';
import { spawnWithProgress } from './asyncChild';
import { IKey } from './keypress';
const chalk = require('chalk');
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

interface IPlayState {
  isPlaying: boolean;   // Currently playing a track (even if paused)
  paused: number;       // Number of milliseconds track has been paused (prior to any current pause)
  beginPause: number;   // Epoch (ms) of the beginning of any current pause (0 if not paused)
}

const playState: IPlayState = {
  isPlaying: false,
  paused: 0,
  beginPause: 0,
};

const keyFncs: Record<string, (key: IKey) => void> = {
  h: doHelp,
  p: doPause,
  q: doQuit,
  r: doResume,
  s: doSkip,
};

process.stdin.on('keypress', (ch, key) => {
  const keyFnc = keyFncs[key.sequence];
  if (keyFnc) {
    keyFnc(key);
  }
});

function doHelp(key: IKey) {
  process.stdout.clearLine(0);
  console.log('h = help, p = pause, q = quit, r = resume, s = skip');
}

function doPause(key: IKey) {
  if (!playState.isPlaying || playState.beginPause) {
    return;
  }
  execPromise("sh -c 'if pid=`pgrep afplay`; then kill -17 $pid; fi'");
  playState.beginPause = Date.now();
}

function doQuit(key: IKey) {
  doSkip(key);
  process.exit(0);
}

function doResume(key: IKey) {
  if (!playState.isPlaying || !playState.beginPause) {
    return;
  }
  playState.paused += Date.now() - playState.beginPause;
  playState.beginPause = 0;
  execPromise("sh -c 'if pid=`pgrep afplay`; then kill -19 $pid; fi'");
}

function doSkip(key: IKey) {
  if (!playState.isPlaying) {
    return;
  }
  execPromise("sh -c 'if pid=`pgrep afplay`; then kill $pid; fi'");
  playState.isPlaying = false;
}

export const makeTime = (milli: number) => `${Math.floor(milli / 60000)}:${("0" + Math.floor(milli / 1000) % 60).substr(-2)}`; 

export const makeBar = (width: number, pct: number) => {
  const ticks = Math.floor(Math.max(0,Math.min(width, Math.floor(width * pct))));
  const togo = width - ticks;
  const shade = '\u2592';
  return `${ticks ? chalk.inverse(' '.repeat(ticks)) : ''}${togo ? shade.repeat(togo) : ''}`;
};

export const play = async (track: string) => {
  if (playState.isPlaying) {
    console.error(`Already playing`);
  }
  const info = await getInfo(track);
  const total = (info.duration || 1) * 1000;
  const totalFmt = makeTime(total);
  const maxWidth = process.stdout.columns || 80;
  const barWidth = maxWidth - 24;
  console.log(` ${info.composer?.join(' and ')}: ${info.title} - ${info.artists?.join(' and ')}`.slice(-maxWidth));
  try {
    await doPlay(track, (elapsed: number) => {
      if (playState.beginPause) {
        return;
      }
      const netElapsed = elapsed - playState.paused;
      const pct = netElapsed / total;
      process.stdout.write(` ${makeBar(barWidth, pct)} ${makeTime(netElapsed)} of ${totalFmt} (${Math.floor(pct * 100)}%)`);
      process.stdout.cursorTo(0);
    });
  } catch (e) {
    console.error(`Error playing track ${track}: ${e.message}`);
  } finally {
    playState.isPlaying = false;
  }
};

export const doPlay = async (track: string, notifyFunc: (elapsed:number) => void | Promise<void>) => {
  playState.isPlaying = true;
  playState.paused = 0;
  playState.beginPause = 0;
  return spawnWithProgress(`/usr/bin/afplay`, [`-q`,`1`,track], notifyFunc);
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
