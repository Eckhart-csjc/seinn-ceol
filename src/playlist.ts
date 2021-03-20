import * as _ from 'lodash';
import { ArrayFileHandler } from './array-file-handler';
import { IKey } from './keypress';
import * as keypress from './keypress';
import * as layout from './layout';
import { isPlaying, stopPlaying, doPlay } from './play';
import * as track from './track';
import { 
  addProgressSuffix,
  error, 
  getRowsPrinted, 
  padOrTruncate, 
  print, 
  removeProgressSuffix,
  warning 
} from './util';

export interface IPlayList {
  name: string;           // Play list name
  orderBy: string[];      // ITrackHydrated keys for order of play
  where?: string;         // Optional where clause for filtering tracks
  current?: string;       // trackPath of track started (undefined to start from the top)
  trackOverlap?: number;  // Milliseconds to shave off end of track before advancing
  layout?: string;        // Name of layout (defaults to config layout)
}

const playListFile = new ArrayFileHandler<IPlayList>('playlists.json');

enum AfterTrackAction {
  Next,
  Pause,
  Previous,
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
let lastHeaderRow: number = 0;
let wasStopped: boolean = false;

const makeAfterMsg = (action: string) => ` - will ${action} at end of track`;

const doNext = (key: IKey) => {
  afterTrackAction = AfterTrackAction.Next;
  stopPlaying();
};

const doPauseAfter = (key: IKey) => {
  if (afterTrackAction !== AfterTrackAction.Pause) {
    if (isPlaying()) {
      if (afterTrackAction === AfterTrackAction.Quit) {
        removeProgressSuffix(makeAfterMsg('quit'));
      }
      addProgressSuffix(makeAfterMsg('pause'));
    }
    afterTrackAction = AfterTrackAction.Pause;
  }
};

const doPrevious = (key: IKey) => {
  afterTrackAction = AfterTrackAction.Previous;
  stopPlaying();
};

const doResume = (key: IKey) => {
  if (afterTrackAction !== AfterTrackAction.Next) {
    if (isPlaying()) {
      removeProgressSuffix(makeAfterMsg(afterTrackAction === AfterTrackAction.Pause ? 'pause' : 'quit'))
    } else {
      process.stdout.clearLine(0);    // Erase paused message so we know we did it
    }
    afterTrackAction = AfterTrackAction.Next;
  }
};

const doStop = (key: IKey) => {
  if (isPlaying()) {
    afterTrackAction = AfterTrackAction.Pause;
    stopPlaying();
    wasStopped = true;
  }
};

const doQuitAfter = (key: IKey) => {
  if (afterTrackAction !== AfterTrackAction.Quit) {
    if (isPlaying()) {
      if (afterTrackAction === AfterTrackAction.Pause) {
        removeProgressSuffix(makeAfterMsg('pause'));
      }
      addProgressSuffix(makeAfterMsg('quit'));
    }
    afterTrackAction = AfterTrackAction.Quit;
  }
};

const afterTrack = async (name: string, plays: number): Promise<void> => {
  switch (afterTrackAction) {
    case AfterTrackAction.Next: {
      const playlist = find(name);
      if (!playlist) {
        error(`Playlist ${name} no longer exists`);
        process.exit(0);
      }
      const sorted = track.sort(playlist.orderBy, playlist.where);
      const lastIndex = playlist.current ? 
        _.findIndex(sorted, (tr) => tr.trackPath === playlist.current) :
        -1;
      if (lastIndex < 0) {
        warning(`Current track not found in playlist, going to first`);
      }
      const nextIndex = wasStopped ? 
        Math.max(0, lastIndex) :
        (lastIndex >= sorted.length - 1) ? 0 : lastIndex + 1; 
      return doPlayList(name, plays, sorted[nextIndex]);
    }

    case AfterTrackAction.Pause: {
      removeProgressSuffix(makeAfterMsg('pause'));
      process.stdout.cursorTo(0);
      print(padOrTruncate(' Paused', process.stdout.columns, 'center'), 'paused');
      process.stdout.cursorTo(0);
      await new Promise((resolve, reject) => setTimeout(resolve, 500));
      return afterTrack(name, plays);
    }

    case AfterTrackAction.Previous: {
      const playlist = find(name);
      if (!playlist) {
        error(`Playlist ${name} no longer exists`);
        process.exit(0);
      }
      const sorted = track.sort(playlist.orderBy, playlist.where);
      const lastIndex = playlist.current ? 
        _.findIndex(sorted, (tr) => tr.trackPath === playlist.current) :
        -1;
      if (lastIndex < 0) {
        warning(`Current track not found in playlist, going to last`);
      }
      const prevIndex = (lastIndex <= 0) ? sorted.length - 1 : lastIndex - 1; 
      return doPlayList(name, plays, sorted[prevIndex]);
    }

    case AfterTrackAction.Quit: {
      removeProgressSuffix(makeAfterMsg('quit'));
      // First, queue up the next track for when we start again
      const playlist = find(name);
      if (!playlist) {
        error(`Playlist ${name} no longer exists`);
        process.exit(0);
      }
      const sorted = track.sort(playlist.orderBy, playlist.where);
      const lastIndex = playlist.current ? 
        _.findIndex(sorted, (tr) => tr.trackPath === playlist.current) :
        -1;
      const nextIndex = (lastIndex >= sorted.length - 1) ? 0 : lastIndex + 1; 
      const nextTrack = sorted[nextIndex];
      save({ ...playlist, current: nextTrack!.trackPath });
      process.exit(0);    // Then exit
    }
  }
};

export const playList = async (name: string) => doPlayList(name, 0);

export const getCurrentTrack = (playlist: IPlayList) => {
  const t = playlist.current ?
    (track.findTrack(playlist.current) ?? getTrackByIndex(playlist, 0)) :
    getTrackByIndex(playlist, 0);
  return t && track.hydrateTrack(t);
}

const getTrackByIndex = (playlist: IPlayList, index: number) => 
  track.sort(playlist.orderBy, playlist.where)[index];

const getTrackIndex = (playlist: IPlayList, t: track.ITrackHydrated) =>
  _.findIndex(track.sort(playlist.orderBy, playlist.where), (tr) => tr.trackPath === t.trackPath);

const doPlayList = async (name: string, plays: number, nextTrack?: track.ITrackHydrated) : Promise<void> => {
  const playlist = find(name);
  if (!playlist) {
    error(`Could not find playlist "${name}"`);
    return;
  }
  const theTrack = nextTrack ?? getCurrentTrack(playlist);
  if (!theTrack) {
    warning(`Playlist ${name} empty`);
    return;
  }
  if (lastHeaderRow === 0 || (getRowsPrinted() - lastHeaderRow) >= (process.stdout.rows-3)) {
    layout.displayHeaders(playlist.layout);
    lastHeaderRow = getRowsPrinted();
  }
  if (!wasStopped) {
    layout.displayColumns(theTrack, getTrackIndex(playlist, theTrack), playlist.layout);
  }
  wasStopped = false;
  const trackPath = theTrack.trackPath;
  save({ ...playlist, current: trackPath });
  afterTrackAction = AfterTrackAction.Next;

  const playListKeys = keypress.makeKeys([
    { name: 'nextTrack', func: doNext, help: 'next track' },
    { name: 'previousTrack', func: doPrevious, help: 'previous track' },
    { name: 'resume', func: doResume, help: 'resume play'},
    { name: 'quitAfterTrack', func: doQuitAfter, help: 'quit after current track' },
    { name: 'pauseAfterTrack', func: doPauseAfter, help: 'pause after current track' },
    { name: 'stop', func: doStop, help: 'stop playing' },
  ]);
  keypress.addKeys(playListKeys);
  const finished = await doPlay(theTrack, playlist.trackOverlap ?? 0);
  await afterTrack(name, plays + (finished ? 1 : 0));
  keypress.removeKeys(playListKeys);
  return;
};
