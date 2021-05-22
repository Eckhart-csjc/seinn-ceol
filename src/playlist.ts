import * as _ from 'lodash';
import { ArrayFileHandler } from './array-file-handler';
import { getSettings } from './config';
import * as diagnostics from './diagnostics';
import { extract, parseExtractor, IValueToken } from './extractor';
import { IKey } from './keypress';
import * as keypress from './keypress';
import * as layout from './layout';
import { isPlaying, stopPlaying, doPlay } from './play';
import * as track from './track';
import { 
  addProgressSuffix,
  ask,
  error, 
  getRowsPrinted, 
  notification,
  padOrTruncate, 
  print, 
  quit,
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
  browse?: boolean;
  next?: string;
  shuffle?: boolean;
  where?: string;
}

let theFile: ArrayFileHandler<IPlayList> | undefined = undefined;
const playListFile = () => theFile ||= new ArrayFileHandler<IPlayList>('playlists.json');

let statTrackTurnAround: diagnostics.ITimingId | undefined = undefined;
const TURN_AROUND = 'Playlist track turn-around';

enum AfterTrackAction {
  Next,
  Pause,
  Previous,
  Shuffle,
  Quit,
}

export const fetchAll = () => playListFile().fetch();

export const find = (name: string, playlists?: IPlayList[]) => _.find(playlists ?? fetchAll(), (pl) => pl.name === name);
export const save = (playlist: IPlayList) => {
  const playlists = fetchAll();
  const existing = find(playlist.name, playlists);
  if (existing) {
    _.merge(existing, playlist);
    playListFile().save(playlists);
  } else {
    playListFile().save([ ...playlists, playlist ]);
  }
};

export const setCurrent = (name: string, current: string) => {
  const playlists = fetchAll();
  const existing = find(name, playlists);
  if (existing) {
    _.merge(existing, { current });
    playListFile().save(playlists);
  } else {
    error(`Could not update current track in playlist ${name} -- playlist not found`);
  }
}

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
let suppressColumns: boolean = false;
let findString: string | undefined = undefined;
let findParser: IValueToken | undefined = undefined;
let findBackward: boolean = false;
let currentPlaylist: IPlayList | undefined = undefined;
let theTrack: track.ITrack | undefined = undefined;

const makeAfterMsg = (action: string) => ` - will ${action} at end of track`;

const doFindNext = (key: IKey) => {
  if (findParser && currentPlaylist && theTrack) {
    const sorted = track.sort(currentPlaylist.orderBy, currentPlaylist.where);
    const current =  _.findIndex(sorted, (t) => t.trackPath === theTrack?.trackPath);
    const ordered = findBackward
    ? [ ...sorted.slice(0,current).reverse(), ...sorted.slice(current).reverse() ]
    : [ ...sorted.slice(current+1), ...sorted.slice(0,current+1) ];
    const found = _.find(ordered, (o) => !!extract({ ...o, current: sorted[current] }, findParser!));
    if (found) {
      setCurrent(currentPlaylist.name, found.trackPath);
      afterTrackAction = AfterTrackAction.Next;
      stopPlaying();
      wasStopped = true;
    } else {
      warning(`Could not find ${findString}`);
    }
  } else {
    warning(`No previous find target`);
  }
}

const doFind = async (key: IKey, backward: boolean) => {
  keypress.suspend();
  const response = await ask([
    { 
      name: 'findString', 
      type: 'input', 
      message: `Find ${backward ? '\u2191' : '\u2193'}`, 
      default: findString || '', 
      askAnswered: true,
    },
  ]);
  keypress.resume();
  if (response.findString) {
    const target = parseExtractor(response.findString);
    if (target) {
      findString = response.findString;
      findParser = target;
      findBackward = backward;
      doFindNext(key);
    }
  }
}

const doFindBackward = async (key: IKey) => doFind(key, true);
const doFindForward = async (key: IKey) => doFind(key, false);

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
    suppressColumns = true;
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
      const nextIndex = wasStopped ? 
        Math.max(0, lastIndex) :
        (lastIndex >= sorted.length - 1) ? 0 : lastIndex + 1; 
      diagnostics.endTiming(statAfter);
      return doPlayList(name, options, plays, sorted[nextIndex]);
    }

    case AfterTrackAction.Pause: {
      statTrackTurnAround = undefined;      // Don't count this pause in track turn-around time
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
      if (playlist) {
        const sorted = track.sort(playlist.orderBy, playlist.where);
        const lastIndex = playlist.current ? 
          _.findIndex(sorted, (tr) => tr.trackPath === playlist.current) :
          -1;
        const nextIndex = (lastIndex >= sorted.length - 1) ? 0 : lastIndex + 1; 
        const nextTrack = sorted[nextIndex];
        setCurrent(name, nextTrack!.trackPath);
      }
      quit();
    }
  }
};

export const playList = async (name: string, options: IPlayListOptions) => {
  shuffleMode = !!options.shuffle;
  return options.browse ? browse(name, options) : doPlayList(name, options, 0);
};

export const getCurrentTrack = (playlist: IPlayList, options: IPlayListOptions) => {
  const sorted = track.sort(playlist.orderBy, playlist.where);
  const current =  playlist.current ? (_.find(sorted, (t) => t.trackPath === playlist.current) ?? sorted[0]) :  sorted[0];
  if (options.next) {
    const parser = parseExtractor(options.next);
    if (parser) {
      const nextTrack = 
        _.find(sorted, (t) => !!extract({ current, ...t}, parser), current.index) ??      // Start with current
        _.find(sorted, (t) => !!extract({ current, ...t}, parser));                      // then wrap around
      if (nextTrack) {
        return nextTrack;
      } else {
        warning(`Could not find any track matching: ${options.next}`);
      }
    }
  }
  return current;
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

const browse = async (name: string, options: IPlayListOptions, nextTrack?: track.ITrackHydrated) => {
  const { playlist } = getPlaylist(name, options);
  if (!playlist) {
    return;
  }

  theTrack = nextTrack ?? getCurrentTrack(playlist, options);
  if (!theTrack) {
    warning(`Playlist ${name} empty`);
    return;
  }

  const settings = getSettings();
  const layOut = layout.getLayout(playlist.layout ?? settings.layout);
  if (!layOut?.columns) {
    return;
  }

  if (lastHeaderRow === 0 || (getRowsPrinted() - lastHeaderRow) >= (process.stdout.rows-3)) {
    layout.displayHeaders(playlist.layout ?? settings.layout);
  }

  const sorted = track.sort(playlist.orderBy, playlist.where);
  const sep = layOut.separator || '|';
  const max = process.stdout.columns - 1;
  const choices = sorted.map((t) => ({
    name: layout.formatColumns(t, layOut).join(sep).slice(2,max),
    value: t,
    short: t.title,
  }));
  const defndx = _.findIndex(sorted, (t) => t.trackPath === theTrack?.trackPath);
  const { selectedTrack } = await ask([
    {
      name: 'selectedTrack',
      type: 'list',
      default: defndx,
      choices,
      message: 'Select track to start',
    }
  ]);
  return doPlayList(name, options, 0, selectedTrack);
};

const doPlayList = async (name: string, options: IPlayListOptions, plays: number, nextTrack?: track.ITrackHydrated) : Promise<void> => {
  const statPrep = diagnostics.startTiming('Playlist prep track');
  if (!statTrackTurnAround && !nextTrack) {   // If we already loaded the next track, don't count this one from here.
    statTrackTurnAround = diagnostics.startTiming(TURN_AROUND);
  }
  const { originalPlaylist, playlist } = getPlaylist(name, options);
  if (!playlist) {
    return;
  }
  currentPlaylist = playlist;
  afterTrackAction = shuffleMode ? AfterTrackAction.Shuffle : AfterTrackAction.Next;
  if (shuffleMode && !nextTrack) {
    return afterTrack(name, options, plays);
  }

  theTrack = nextTrack ?? getCurrentTrack(playlist, options);
  if (!theTrack) {
    warning(`Playlist ${name} empty`);
    return;
  }
  const settings = getSettings();
  if (lastHeaderRow === 0 || (getRowsPrinted() - lastHeaderRow) >= (process.stdout.rows-3)) {
    layout.displayHeaders(playlist.layout ?? settings.layout);
    lastHeaderRow = getRowsPrinted();
  }
  if (!suppressColumns) {
    layout.displayColumns(theTrack, playlist.layout ?? settings.layout);
  }
  suppressColumns = false;
  wasStopped = false;
  const trackPath = theTrack.trackPath;
  if (originalPlaylist) {
    setCurrent(name, trackPath);
  }

  const playListKeys = keypress.makeKeys([
    { name: 'findBackward', func: doFindBackward, help: 'find \u2191' },
    { name: 'findForward', func: doFindForward, help: 'find \u2193' },
    { name: 'findNext', func: doFindNext, help: 'find next' },
    { name: 'nextTrack', func: doNext, help: 'next track' },
    { name: 'pauseAfterTrack', func: doPauseAfter, help: 'pause at end of track' },
    { name: 'previousTrack', func: doPrevious, help: 'previous track' },
    { name: 'quitAfterTrack', func: doQuitAfter, help: 'quit at end of track' },
    { name: 'resume', func: doResume, help: () => afterTrackAction === AfterTrackAction.Pause ? 'cancel pause' : (afterTrackAction === AfterTrackAction.Quit ? 'cancel quit' : '') },
    { name: 'shuffle', func: doShuffle, help: () => `turn ${shuffleMode ? 'off' : 'on'} shuffle mode` },
    { name: 'stop', func: doStop, help: 'stop playing' },
  ]);
  keypress.addKeys(playListKeys);
  diagnostics.endTiming(statPrep);
  if (statTrackTurnAround) {
    diagnostics.endTiming(statTrackTurnAround!);
  }
  const turnAroundTimings = diagnostics.getTimings()[TURN_AROUND]?.filter((t) => !!t.end);
  const turnAround = turnAroundTimings?.length ? turnAroundTimings[turnAroundTimings.length - 1] : undefined;
  const tat = turnAround?.end ? (turnAround.end - turnAround.start) : 0;
  const finished = await doPlay(theTrack, tat + (playlist.trackOverlap ?? settings.trackOverlap ?? 0));
  statTrackTurnAround = diagnostics.startTiming(TURN_AROUND);
  await afterTrack(name, options, plays + (finished ? 1 : 0));
  keypress.removeKeys(playListKeys);
  return;
};

export const getCacheStats = () => playListFile().getCacheStats();
