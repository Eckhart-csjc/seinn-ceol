import { getSettings } from './config';
import * as keypress from './keypress';
import { SegOut } from './segout';
import { bumpPlays, findTrack, formatInfo, ITrack, makeTrack, } from './track';
import { warning } from './util';

export interface IPlayer {
  play: (track: ITrack) => Promise<boolean>;  // true == played to completion
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
    warning(`Already playing`);
  }
  const playKeys: keypress.IKeyMapping[] = [
    { 
      key: {sequence: 'i'}, 
      func: (key: keypress.IKey) =>  {
        process.stdout.cursorTo(0);
        process.stdout.clearLine(0);
        const o = new SegOut();
        formatInfo(track).map((i) => o.add(i, ' | ', " \u2192 ", "detail"));
        o.nl();
      },
      help: 'info on track/composer',
    },
  ];
  playKeys.map((km) => keypress.addKey(km));
  playState.isPlaying = true;
  if (await player.play(track)) {
    bumpPlays(track.trackPath);
  }
  playState.isPlaying = false;
  playKeys.map((km) => keypress.removeKey(km));
}
