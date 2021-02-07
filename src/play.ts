import { getSettings } from './config';
import * as keypress from './keypress';
import { SegOut } from './segout';
import { bumpPlays, findTrack, formatInfo, ITrack, makeTrack, } from './track';
import { warning } from './util';

export interface IPlayer {
  play: (
    track: ITrack,                // Track to play
    earlyReturn?: number,         // How soon before track length to return (ms)
  ) => Promise<boolean>;          // true == played to completion (or earlyReturn)
  stop: () => Promise<boolean>;   // true == stopped
}

interface IPlayState {
  isPlaying: boolean;
};

const playState: IPlayState = {
  isPlaying: false,
};

export const isPlaying = () => playState.isPlaying;

export const getPlayer = (): IPlayer => {
  const playerName = getSettings().player;
  return require(`./players/${playerName}`);
};

export const stopPlaying = async () => playState.isPlaying ? await getPlayer().stop() : true;

export const play = async (track: ITrack | string): Promise<void> => { await doPlay(track); }

export const doPlay = async (
  track: ITrack | string,         // Track, or trackpath
  earlyReturn: number = 0,        // Milliseconds to subtract from duration for return
): Promise<boolean> => {
  if (typeof track === 'string') {
    return doPlay(findTrack(track) || await makeTrack(track), earlyReturn);
  }
  const player = getPlayer();
  if (playState.isPlaying) {
    warning(`Already playing`);
  }
  const playKeys = keypress.makeKeys([
    { 
      name: 'info',
      func: (key: keypress.IKey) =>  {
        process.stdout.cursorTo(0);
        process.stdout.clearLine(0);
        const o = new SegOut();
        formatInfo(track).map((i) => o.add(i, ' | ', " \u2192 ", "detail"));
        o.nl();
      },
      help: 'info on track/composer',
    },
  ]);
  keypress.addKeys(playKeys);
  playState.isPlaying = true;
  const played = await player.play(track, earlyReturn);
  if (played) {
    bumpPlays(track.trackPath);
  }
  playState.isPlaying = false;
  keypress.removeKeys(playKeys);
  return played;
}
