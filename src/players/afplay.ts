import { spawnWithProgress } from '../asyncChild';
import { IKey, IKeyMapping } from '../keypress';
import * as keypress from '../keypress';
import { ITrack } from '../track';
import { makeBar, makeTime } from '../util';

const chalk = require('chalk');
const execPromise = require('child-process-promise').exec;

interface IPlayState {
  paused: number;       // Number of milliseconds track has been paused (prior to any current pause)
  beginPause: number;   // Epoch (ms) of the beginning of any current pause (0 if not paused)
}

const playState: IPlayState = {
  paused: 0,
  beginPause: 0,
};

const playKeys: IKeyMapping[] = [
  { key: {sequence: 'q'}, func: doQuit },
  { key: {sequence: 's'}, func: doSkip, help: 'skip' },
];

// This is currently disabled, because afplay can only suspend output, not actually pause
function doPause(key: IKey) {
  if (playState.beginPause) {
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
  if (!playState.beginPause) {
    return;
  }
  playState.paused += Date.now() - playState.beginPause;
  playState.beginPause = 0;
  execPromise("sh -c 'if pid=`pgrep afplay`; then kill -19 $pid; fi'");
}

function doSkip(key: IKey) {
  execPromise("sh -c 'if pid=`pgrep afplay`; then kill $pid; fi'");
}

export const play = async (track: ITrack) => {
  const total = (track.duration || 1) * 1000;
  const totalFmt = makeTime(total);
  const maxWidth = process.stdout.columns || 80;
  const barWidth = maxWidth - totalFmt.length * 2 - 15;
  process.stdout.clearLine(0);
  console.log(`${track.composerKey || 'Unknown'}: ${track.title} - ${track.artists?.join(' and ')}`.slice(-maxWidth));
  playState.paused = 0;
  playState.beginPause = 0;
  playKeys.forEach((km) => keypress.addKey(km));
  try {
    await spawnWithProgress(`/usr/bin/afplay`, [`-q`,`1`,track.trackPath], (elapsed: number) => {
      if (playState.beginPause) {
        return;
      }
      const netElapsed = elapsed - playState.paused;
      const pct = netElapsed / total;
      process.stdout.write(chalk.dim(` ${makeBar(barWidth, pct)} ${makeTime(netElapsed)} of ${totalFmt} (${Math.floor(pct * 100)}%)`));
      process.stdout.cursorTo(0);
    });
  } catch (e) {
    console.error(`Error playing track ${track.trackPath}: ${e.message}`);
  } finally {
    playKeys.forEach((km) => keypress.removeKey(km));
  }
};
