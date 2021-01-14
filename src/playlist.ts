import * as _ from 'lodash';
import { ArrayFileHandler } from './array-file-handler';
import { applyThemeSetting } from './config';
import { IKey, IKeyMapping } from './keypress';
import * as keypress from './keypress';
import { isPlaying, play } from './play';
import * as track from './track';

export interface IPlayList {
  name: string;           // Play list name
  orderBy: string[];      // ITrackSort keys for order of play
  lastPlayed?: string;    // trackPath of track ast played (undefined to start from the top)
}

const playListFile = new ArrayFileHandler<IPlayList>('playlists.json');

enum AfterTrackAction {
  Next,
  Pause,
  Quit,
}

export const fetchAll = () => playListFile.fetch();

export const find = (name: string, playlists?: IPlayList[]) => _.find(playlists ?? fetchAll(), (pl) => pl.name === name);
export const save = (playlist: IPlayList) => {
  const playlists = fetchAll();
  const existing = find(playlist.name, playlists);
  if (existing) {
    _.merge(existing, playlist);
    playListFile.save(playlists);
  } else {
    playListFile.save([ ...playlists, playlist ]);
  }
};

let afterTrackAction: AfterTrackAction = AfterTrackAction.Next;

const doPauseAfter = (key: IKey) => {
  if (afterTrackAction !== AfterTrackAction.Pause) {
    process.stdout.clearLine(0);
    console.log(applyThemeSetting(`Will pause after current track (press 'r' to cancel)`, 'notification'));
    afterTrackAction = AfterTrackAction.Pause;
  }
};

const doResume = (key: IKey) => {
  if (afterTrackAction !== AfterTrackAction.Next) {
    if (isPlaying()) {
      process.stdout.clearLine(0);
      console.log(applyThemeSetting(`${(afterTrackAction === AfterTrackAction.Pause) ? 'Pause' : 'Quit'} after current track canceled`, 'notification'));
    }
    afterTrackAction = AfterTrackAction.Next;
  }
};

const doQuitAfter = (key: IKey) => {
  if (afterTrackAction !== AfterTrackAction.Quit) {
    if (isPlaying()) {
      process.stdout.clearLine(0);
      console.log(applyThemeSetting(`Will quit after current track (press 'r' or 'P' to cancel)`, 'notification'));
    }
    afterTrackAction = AfterTrackAction.Quit;
  }
};

const playListKeys: IKeyMapping[] = [
  { key: {sequence: 'r'}, func: doResume, help: 'cancel pause/quit'},
  { key: {sequence: 'Q'}, func: doQuitAfter, help: 'quit after current track' },
  { key: {sequence: 'P'}, func: doPauseAfter, help: 'pause after current track' },
];

const afterTrack = async (name: string): Promise<void> => {
  switch (afterTrackAction) {
    case AfterTrackAction.Next:
      return playList(name);

    case AfterTrackAction.Pause:
      process.stdout.clearLine(0);
      process.stdout.write(applyThemeSetting(' [PAUSED]', 'paused'));
      process.stdout.cursorTo(0);
      await new Promise((resolve, reject) => setTimeout(resolve, 500));
      return afterTrack(name);

    case AfterTrackAction.Quit:
      process.exit(0);
  }
};

export const playList = async (name: string): Promise<void> => {
  const playlist = find(name);
  if (!playlist) {
    console.error(`Could not find playlist "${name}"`);
    return;
  }
  const sorted = track.sort(playlist.orderBy);
  const lastIndex = playlist.lastPlayed ? _.findIndex(sorted, (track) => track.trackPath === playlist.lastPlayed) : -1;
  const nextIndex = (lastIndex >= sorted.length - 1) ? 0 : lastIndex + 1; 
  const next = sorted[nextIndex];
  const trackPath = next.trackPath;
  afterTrackAction = AfterTrackAction.Next;
  playListKeys.forEach((km) => keypress.addKey(km));
  await play(trackPath);
  save({ ...playlist, lastPlayed: trackPath });
  return afterTrack(name);
};

