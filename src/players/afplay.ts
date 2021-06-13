import { spawnWithProgress } from '../asyncChild';
import { IKey, IKeyMaker } from '../keypress';
import * as keypress from '../keypress';
import { ITrackHydrated } from '../track';
import {
  addProgressSuffix,
  cursorTo,
  error,
  inAsk,
  makeProgressBar,
  makeTime,
  print,
  removeProgressSuffix,
  warning
} from '../util';

const execPromise = require('child-process-promise').exec;

interface IPlayState {
  paused: number;       // Number of milliseconds track has been paused (prior to any current pause)
  beginPause: number;   // Epoch (ms) of the beginning of any current pause (0 if not paused)
  killed: boolean;
  rewind: boolean;
}

const playState: IPlayState = {
  paused: 0,
  beginPause: 0,
  killed: false,
  rewind: false,
};

const TMP_TRACKPATH = '/tmp/seinn-ceol-sample.m4a';
const PAUSED  = ' - Paused';

let memoizedCanPause: boolean | undefined;
const canPause = async () => {
  if (memoizedCanPause === undefined) {
    try {
      await execPromise('ffmpeg -version 2>&1 >/dev/null');
      memoizedCanPause = true;
    } catch (e) {
      warning(`Install ffpmeg to enable pause/resume for this player`);
      memoizedCanPause = false;
    }
  }
  return memoizedCanPause;
};

const makePlayKeys = async () => keypress.makeKeys([
  { name: 'quit', func: doQuit, help: 'quit' },
  { name: 'rewind', func: doRewind, help: 'rewind track' },
  ...((await canPause()) ?
    [
      { name: 'pause', func: doPause, help: () => playState.beginPause ? '' : 'pause' },
      { name: 'resume', func: doResume, help: () => playState.beginPause ? 'resume' : ''},
    ] as IKeyMaker[] :
    []
  ),
]);

function doPause(key: IKey) {
  if (playState.beginPause) {
    return;
  }
  void killPlayer();
  playState.beginPause = Date.now();
  addProgressSuffix(PAUSED);
}

function doQuit(key: IKey) {
  playState.beginPause = 0;
  void killPlayer();
}

function doResume(key: IKey) {
  if (!playState.beginPause) {
    return;
  }
  playState.paused += Date.now() - playState.beginPause;
  playState.killed = false;
  playState.beginPause = 0;
}

function doRewind(key: IKey) {
  playState.rewind = true;
  void killPlayer();
}

async function killPlayer() {
  execPromise('pkill afplay || true');
  playState.killed = true;
  playState.beginPause = 0;
}

export const stop = async () => {
  await killPlayer();
  return true;
};

export const play = async (track: ITrackHydrated, earlyReturn: number = 0): Promise<boolean> => {
  const playKeys = await makePlayKeys();
  keypress.addKeys(playKeys);
  try {
    await doPlay(track, earlyReturn);
    if (playState.rewind) {
      return play(track);
    }
  } catch (e) {
    error(`Error playing track ${track.trackPath}: ${e.message}`);
    playState.killed = true;
  } finally {
    keypress.removeKeys(playKeys);
  }
  return !playState.killed;
};

const doPlay = async (track: ITrackHydrated, earlyReturn: number = 0, offset: number = 0) => {
  const total = (track.duration || 1) * 1000;
  const totalFmt = makeTime(total);
  const maxWidth = process.stdout.columns || 80;
  const barWidth = maxWidth - 1;
  const startOffset = Math.floor(offset / 1000);  // Offset in seconds
  if (startOffset) {
    await execPromise(`rm -f ${TMP_TRACKPATH}`);
    await execPromise(
      `ffmpeg -ss ${startOffset} -i "${track.trackPath.replace(/"/g, `\\"`)}" -c copy ${TMP_TRACKPATH}`
    );
  }
  const startPlay = Date.now();
  playState.paused = 0;
  playState.beginPause = 0;
  playState.killed = false;
  playState.rewind = false;
  await spawnWithProgress(
    `/usr/bin/afplay`,
    [`-q`,`1`, startOffset ? TMP_TRACKPATH : track.trackPath],
    (elapsed: number) => {
      if (inAsk) {
        return;
      }
      const netElapsed = elapsed + offset - playState.paused;
      const pct = netElapsed / total;
      print(' ');
      print(makeProgressBar(barWidth, pct,
        `${makeTime(netElapsed)} of ${totalFmt} (${Math.floor(pct * 100)}%)`));
      cursorTo(0);
    },
    100,
    ((track.duration ?? 0) * 1000) - offset - earlyReturn
  );
  if (playState.beginPause) {
    await new Promise<void>((resolve, reject) => {
      const timer = setInterval(async () => {
        if (playState.beginPause) {
          return;                   // Still paused
        }
        clearInterval(timer);       // No more polling
        removeProgressSuffix(PAUSED);
        const newOffset = (Date.now() - startPlay) + offset - playState.paused;
        if (!playState.killed) {    // If not killed, assume resume
          await doPlay(track, earlyReturn, newOffset);
        }
        resolve();                  // Resume or not, we're done here
      }, 500);
    });
  }
};
