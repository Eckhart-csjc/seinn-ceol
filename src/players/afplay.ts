import { spawnWithProgress } from '../asyncChild';
import { IKey, IKeyMapping } from '../keypress';
import * as keypress from '../keypress';
import { ITrack } from '../track';
import { error, makeProgressBar, makeTime, print, printLn } from '../util';

const execPromise = require('child-process-promise').exec;

interface IPlayState {
  paused: number;       // Number of milliseconds track has been paused (prior to any current pause)
  beginPause: number;   // Epoch (ms) of the beginning of any current pause (0 if not paused)
  killed: boolean;
  replay: boolean;
}

const playState: IPlayState = {
  paused: 0,
  beginPause: 0,
  killed: false,
  replay: false,
};

const playKeys: IKeyMapping[] = [
  { key: {sequence: 'q'}, func: doQuit },
  { key: {sequence: 'R'}, func: doReplay, help: 'replay' },
];

// This is currently disabled, because afplay can only suspend output, not actually pause
function doPause(key: IKey) {
  if (playState.beginPause) {
    return;
  }
  execPromise("sh -c 'if pid=`pgrep afplay`; then kill -17 $pid; fi'");
  print(' [PAUSED]', 'paused');
  process.stdout.cursorTo(0);
  playState.beginPause = Date.now();
}

function doQuit(key: IKey) {
  killPlayer();
}

function doResume(key: IKey) {
  if (!playState.beginPause) {
    return;
  }
  playState.paused += Date.now() - playState.beginPause;
  playState.beginPause = 0;
  execPromise("sh -c 'if pid=`pgrep afplay`; then kill -19 $pid; fi'");
}

function doReplay(key: IKey) {
  playState.replay = true;
  killPlayer();
}

async function killPlayer() {
  execPromise("pkill afplay || true");
  playState.killed = true;
}

export const stop = async () => {
  await killPlayer();
  return true;
}

export const play = async (track: ITrack, earlyReturn: number = 0): Promise<boolean> => {
  const total = (track.duration || 1) * 1000;
  const totalFmt = makeTime(total);
  const maxWidth = process.stdout.columns || 80;
  const barWidth = maxWidth - 1;
  playState.paused = 0;
  playState.beginPause = 0;
  playState.killed = false;
  playState.replay = false;
  playKeys.forEach((km) => keypress.addKey(km));
  try {
    await spawnWithProgress(`/usr/bin/afplay`, [`-q`,`1`,track.trackPath], (elapsed: number) => {
      if (playState.beginPause) {
        return;
      }
      const netElapsed = elapsed - playState.paused;
      const pct = netElapsed / total;
      print(' ');
      print(makeProgressBar(barWidth, pct,
        `${makeTime(netElapsed)} of ${totalFmt} (${Math.floor(pct * 100)}%)`));
      process.stdout.cursorTo(0);
    }, 1000, ((track.duration ?? 0) * 1000) - earlyReturn);
    if (playState.replay) {
      return play(track);
    }
  } catch (e) {
    error(`Error playing track ${track.trackPath}: ${e.message}`);
    playState.killed = true;
  } finally {
    playKeys.forEach((km) => keypress.removeKey(km));
  }
  return !playState.killed;
};
