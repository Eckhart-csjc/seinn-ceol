import { spawnWithProgress } from './asyncChild';
import { IKey, IKeyMapping } from './keypress';
import * as keypress from './keypress';
import { bumpPlays, getInfo } from './track';
import { makeBar, makeTime } from './util';

const chalk = require('chalk');
const execPromise = require('child-process-promise').exec;

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

export const isPlaying = () => playState.isPlaying;

const playKeys: IKeyMapping[] = [
  { key: {sequence: 'h'}, func: doHelp },
  { key: {sequence: 'p'}, func: doPause },
  { key: {sequence: 'q'}, func: doQuit },
  { key: {sequence: 'r'}, func: doResume },
  { key: {sequence: 's'}, func: doSkip },
];

function doHelp(key: IKey) {
  process.stdout.clearLine(0);
  process.stdout.write(chalk.grey('p = pause, r = resume, s = skip, '));      // Prefixed to help from main
}

function doPause(key: IKey) {
  if (!playState.isPlaying || playState.beginPause) {
    return;
  }
  execPromise("sh -c 'if pid=`pgrep afplay`; then kill -17 $pid; fi'");
  process.stdout.write(chalk.yellow(' [PAUSED]'));
  process.stdout.cursorTo(0);
  playState.beginPause = Date.now();
}

function doQuit(key: IKey) {
  doSkip(key);
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

export const play = async (track: string) => {
  if (playState.isPlaying) {
    console.error(`Already playing`);
  }
  const info = await getInfo(track);
  const total = (info.duration || 1) * 1000;
  const totalFmt = makeTime(total);
  const maxWidth = process.stdout.columns || 80;
  const barWidth = maxWidth - totalFmt.length * 2 - 15;
  process.stdout.clearLine(0);
  console.log(`${info.composer?.join(' and ') || 'Unknown'}: ${info.title} - ${info.artists?.join(' and ')}`.slice(-maxWidth));
  try {
    await doPlay(track, (elapsed: number) => {
      if (playState.beginPause) {
        return;
      }
      const netElapsed = elapsed - playState.paused;
      const pct = netElapsed / total;
      process.stdout.write(chalk.dim(` ${makeBar(barWidth, pct)} ${makeTime(netElapsed)} of ${totalFmt} (${Math.floor(pct * 100)}%)`));
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
  playKeys.forEach((km) => keypress.addKey(km));
  await spawnWithProgress(`/usr/bin/afplay`, [`-q`,`1`,track], notifyFunc);
  playKeys.forEach((km) => keypress.removeKey(km));
  bumpPlays(track);
};
