import { getSettings } from './config';
import { bumpPlays, findTrack, ITrack, makeTrack } from './track';

export interface IPlayer {
  play: (track: ITrack) => Promise<void>;
}

interface IPlayState {
  isPlaying: boolean;
};

const playState: IPlayState = {
  isPlaying: false,
};

export const isPlaying = () => playState.isPlaying;

export const play = async (track: ITrack | string): Promise<void> => {
  if (typeof track === 'string') {
    return play(findTrack(track) || await makeTrack(track));
  }
  const playerName = getSettings().player;
  const player: IPlayer = require(`./players/${playerName}`);
  if (playState.isPlaying) {
    console.error(`Already playing`);
  }
  playState.isPlaying = true;
  await player.play(track);
  playState.isPlaying = false;
  bumpPlays(track.trackPath);
}
