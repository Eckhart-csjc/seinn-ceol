import { getSettings } from './config';
import * as keypress from './keypress';
import { SegOut } from './segout';
import { bumpPlays, findTrack, formatInfo, ITrack, makeTrack, } from './track';
import { warning } from './util';

export interface IPlayer {
  play: (track: ITrack) => Promise<boolean>;  // true == played to completion
  stop: () => Promise<boolean>;               // true == stopped
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

export const play = async (track: ITrack | string): Promise<void> => { doPlay(track); }

export const doPlay = async (track: ITrack | string): Promise<boolean> => {
  if (typeof track === 'string') {
    return doPlay(findTrack(track) || await makeTrack(track));
  }
  const player = getPlayer();
  if (playState.isPlaying) {
    warning(`Already playing`);
  }
  const playKeys: keypress.IKeyMapping[] = [
    { 
      key: {name: 'i'}, 
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
  const played = await player.play(track);
  if (played) {
    bumpPlays(track.trackPath);
  }
  playState.isPlaying = false;
  playKeys.map((km) => keypress.removeKey(km));
  return played;
}
