import * as _ from 'lodash';
import { ArrayFileHandler } from './array-file-handler';
import { getSettings } from './config';
import * as diagnostics from './diagnostics';
import { extract, parseExtractor } from './extractor';
import { IKey } from './keypress';
import * as keypress from './keypress';
import * as layout from './layout';
import { isPlaying, stopPlaying, doPlay } from './play';
import * as track from './track';
import { 
  addProgressSuffix,
  error, 
  getRowsPrinted, 
  notification,
  padOrTruncate, 
  print, 
  removeProgressSuffix,
  warning 
} from './util';

export interface IPlayList {
  name: string;           // Play list name
  orderBy: string[];      // Queries (optionally followed by comma and sort order) for order of play
  where?: string;         // Optional where clause for filtering tracks
  current?: string;       // trackPath of track started (undefined to start from the top)
  trackOverlap?: number;  // Milliseconds to shave off end of track before advancing
  layout?: string;        // Name of layout (defaults to config layout)
}

interface IPlayListOptions {
  where?: string;
  shuffle?: boolean;
}

const playListFile = new ArrayFileHandler<IPlayList>('playlists.json');

enum AfterTrackAction {
  Next,
  Pause,
  Previous,
  Shuffle,
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

export const filter = (where?: string): IPlayList[] => {
  const token = where && parseExtractor(where);
  if (where && !token) {
    return [];      // A Parse error occurred
  }
  const playlists = fetchAll();
  return token ?
    playlists.filter((t) => !!extract(t, token)) :
    playlists;
};

let afterTrackAction: AfterTrackAction = AfterTrackAction.Next;
let shuffleMode: boolean = false;
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

const doShuffle = (key: IKey) => {
  shuffleMode = !shuffleMode;
  afterTrackAction = shuffleMode ? AfterTrackAction.Shuffle : AfterTrackAction.Next;
  notification(`Shuffle ${shuffleMode ? 'on' : 'off'}`);
  if (shuffleMode) {
    stopPlaying();
  }
};

const doResume = (key: IKey) => {
  if ([AfterTrackAction.Pause, AfterTrackAction.Quit].includes(afterTrackAction)) {
    if (isPlaying()) {
      removeProgressSuffix(makeAfterMsg(afterTrackAction === AfterTrackAction.Pause ? 'pause' : 'quit'))
    } else {
      process.stdout.clearLine(0);    // Erase paused message so we know we did it
    }
    afterTrackAction = shuffleMode ? AfterTrackAction.Shuffle : AfterTrackAction.Next;
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

const afterTrack = async (name: string, options: IPlayListOptions,  plays: number): Promise<void> => {
  switch (afterTrackAction) {
    case AfterTrackAction.Next: {
      const statAfter = diagnostics.startTiming('Playlist next track');
      const { playlist } = getPlaylist(name, options);
      if (!playlist) {
        return;
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
      diagnostics.endTiming(statAfter);
      return doPlayList(name, options, plays, sorted[nextIndex]);
    }

    case AfterTrackAction.Pause: {
      removeProgressSuffix(makeAfterMsg('pause'));
      process.stdout.cursorTo(0);
      print(padOrTruncate(' Paused', process.stdout.columns, 'center'), 'paused');
      process.stdout.cursorTo(0);
      await new Promise((resolve, reject) => setTimeout(resolve, 500));
      return afterTrack(name, options, plays);
    }

    case AfterTrackAction.Previous: {
      const { playlist } = getPlaylist(name, options);
      if (!playlist) {
        return;
      }
      const sorted = track.sort(playlist.orderBy, playlist.where);
      const lastIndex = playlist.current ? 
        _.findIndex(sorted, (tr) => tr.trackPath === playlist.current) :
        -1;
      if (lastIndex < 0) {
        warning(`Current track not found in playlist, going to last`);
      }
      const prevIndex = (lastIndex <= 0) ? sorted.length - 1 : lastIndex - 1; 
      return doPlayList(name, options, plays, sorted[prevIndex]);
    }

    case AfterTrackAction.Shuffle: {
      const { playlist } = getPlaylist(name, options);
      if (!playlist) {
        return;
      }
      const sorted = track.sort(['lastPlayed or 0'], playlist.where);
      const nextIndex = Math.floor(Math.random() * (sorted.length * 9 / 10));  // Choose from the 90% least recently played
      return doPlayList(name, options, plays, sorted[nextIndex]);
    }

    case AfterTrackAction.Quit: {
      removeProgressSuffix(makeAfterMsg('quit'));
      // First, queue up the next track for when we start again
      const { playlist } = getPlaylist(name, options);
      if (!playlist) {
        process.exit(1);
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

export const playList = async (name: string, options: IPlayListOptions) => {
  shuffleMode = !!options.shuffle;
  return doPlayList(name, options, 0);
};

export const getCurrentTrack = (playlist: IPlayList) => {
  const sorted = track.sort(playlist.orderBy, playlist.where);
  return playlist.current ? (_.find(sorted, (t) => t.trackPath === playlist.current) ?? sorted[0]) :  sorted[0];
};

const getPlaylist = (name: string, options: IPlayListOptions) => {
  const originalPlaylist = find(name);
  if (!originalPlaylist) {
    error(`Could not find playlist "${name}"`);
    return {};
  }
  const playlist = options.where ?
    {
      ...originalPlaylist,
      where: originalPlaylist.where ? 
        `(${originalPlaylist.where}) && (${options.where})` :
        options.where,
    } :
    originalPlaylist;
  return { originalPlaylist, playlist };
};

let statTrackTurnAround: diagnostics.ITimingId | undefined = undefined;

const doPlayList = async (name: string, options: IPlayListOptions, plays: number, nextTrack?: track.ITrackHydrated) : Promise<void> => {
  const statPrep = diagnostics.startTiming('Playlist prep track');
  if (!statTrackTurnAround) {
    statTrackTurnAround = diagnostics.startTiming('Playlist track turn-around');
  }
  const { originalPlaylist, playlist } = getPlaylist(name, options);
  if (!playlist) {
    return;
  }
  afterTrackAction = shuffleMode ? AfterTrackAction.Shuffle : AfterTrackAction.Next;
  if (shuffleMode && !nextTrack) {
    return afterTrack(name, options, plays);
  }

  const theTrack = nextTrack ?? getCurrentTrack(playlist);
  if (!theTrack) {
    warning(`Playlist ${name} empty`);
    return;
  }
  const settings = getSettings();
  if (lastHeaderRow === 0 || (getRowsPrinted() - lastHeaderRow) >= (process.stdout.rows-3)) {
    layout.displayHeaders(playlist.layout ?? settings.layout);
    lastHeaderRow = getRowsPrinted();
  }
  if (!wasStopped) {
    layout.displayColumns(theTrack, playlist.layout ?? settings.layout);
  }
  wasStopped = false;
  const trackPath = theTrack.trackPath;
  if (originalPlaylist) {
    save({ ...originalPlaylist, current: trackPath });
  }

  const playListKeys = keypress.makeKeys([
    { name: 'nextTrack', func: doNext, help: 'next track' },
    { name: 'previousTrack', func: doPrevious, help: 'previous track' },
    { name: 'resume', func: doResume, help: () => afterTrackAction === AfterTrackAction.Pause ? 'cancel pause' : (afterTrackAction === AfterTrackAction.Quit ? 'cancel quit' : '') },
    { name: 'quitAfterTrack', func: doQuitAfter, help: 'quit at end of track' },
    { name: 'pauseAfterTrack', func: doPauseAfter, help: 'pause at end of track' },
    { name: 'shuffle', func: doShuffle, help: () => `turn ${shuffleMode ? 'off' : 'on'} shuffle mode` },
    { name: 'stop', func: doStop, help: 'stop playing' },
  ]);
  keypress.addKeys(playListKeys);
  diagnostics.endTiming(statPrep);
  const turnAround = diagnostics.endTiming(statTrackTurnAround!);
  const tat = turnAround?.end ? (turnAround.end - turnAround.start) : 0;
  const finished = await doPlay(theTrack, tat + (playlist.trackOverlap ?? settings.trackOverlap ?? 0));
  statTrackTurnAround = diagnostics.startTiming('Playlist track turn-around');
  await afterTrack(name, options, plays + (finished ? 1 : 0));
  keypress.removeKeys(playListKeys);
  return;
};

export const getCacheStats = () => playListFile.getCacheStats();
