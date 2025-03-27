import { getSettings } from './config';
import * as keypress from './keypress';
import { displayColumns } from './layout';
import { bumpPlays, findTrack, hydrateTrack, ITrackHydrated, makeTrack, } from './track';
import { warning } from './util';

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

const players: Record<string, IPlayer> = {
};

export const getPlayer = (): IPlayer => {
  const playerName = getSettings().player;
  if (!players[playerName]) {
    players[playerName] = require(`./players/${playerName}`);
  }
  return players[playerName];
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
      func: (_key: keypress.IKey) =>  {
        const infoLayout = getSettings().infoLayout;
        if (infoLayout) {
          const t = hydrateTrack(findTrack(track.trackPath) ?? track);   // Get most up to date
          displayColumns(t, getSettings().infoLayout);
        } else {
          warning('No infoLayout defined in config.json');
        }
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
