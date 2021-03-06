import { getSettings } from './config';
import * as keypress from './keypress';
import { SegOut } from './segout';
import { bumpPlays, findTrack, formatInfo, hydrateTrack, ITrackHydrated, makeTrack, } from './track';
import { eraseLine, warning } from './util';

export interface IPlayer {
  play: (
    track: ITrackHydrated,        // Track to play
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

export const cmdPlay = async (track: ITrackHydrated | string): Promise<void> => { await doPlay(track); };

export const doPlay = async (
  track: ITrackHydrated | string,         // Track, or trackpath
  earlyReturn: number = 0,        // Milliseconds to subtract from duration for return
): Promise<boolean> => {
  if (typeof track === 'string') {
    return doPlay(hydrateTrack(findTrack(track) || await makeTrack(track)), earlyReturn);
  }
  const player = getPlayer();
  if (playState.isPlaying) {
    warning(`Already playing`);
  }
  const playKeys = keypress.makeKeys([
    {
      name: 'info',
      func: (key: keypress.IKey) =>  {
        eraseLine();
        const o = new SegOut();
        const t = hydrateTrack(findTrack(track.trackPath) ?? track);   // Get most up to date
        formatInfo(t).map((i) => o.add(i, ' | ', ' \u2192 ', 'detail'));
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
};
