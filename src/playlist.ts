import * as _ from 'lodash';
import { ArrayFileHandler } from './array-file-handler';
import { Theming } from './config';
import { IKey, IKeyMapping } from './keypress';
import * as keypress from './keypress';
import { isPlaying, play } from './play';
import { SegOut } from './segout';
import * as track from './track';
import { error, notification, print } from './util';

export interface IPlayList {
  name: string;           // Play list name
  orderBy: string[];      // ITrackSort keys for order of play
  lastPlayed?: string;    // trackPath of track ast played (undefined to start from the top)
  columns?: IPlayListColumn[];  // Columns to display
  theming?: Theming;       // General theming for display
  hdrTheming?: Theming;   // Theming for header
  separator?: string;     // Column separator (default is '|')
  separatorTheming?: Theming; // Theming for separator
}

export interface IPlayListColumn {
  header: string;         // Text for column header
  template: string;       // lodash template against track.ITrackDisplay
  width?: string;         // "N", "N%", or range of these separated by ":" (both optional)
  theming?: Theming;      // Theming override for this column only
  hdrTheming?: Theming;   // Theming override for header 
};

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
    notification(`Will pause after current track (press 'r' to cancel)`);
    afterTrackAction = AfterTrackAction.Pause;
  }
};

const doResume = (key: IKey) => {
  if (afterTrackAction !== AfterTrackAction.Next) {
    if (isPlaying()) {
      process.stdout.clearLine(0);
      notification(`${(afterTrackAction === AfterTrackAction.Pause) ? 'Pause' : 'Quit'} after current track canceled`);
    }
    afterTrackAction = AfterTrackAction.Next;
  }
};

const doQuitAfter = (key: IKey) => {
  if (afterTrackAction !== AfterTrackAction.Quit) {
    if (isPlaying()) {
      process.stdout.clearLine(0);
      notification(`Will quit after current track (press 'r' or 'P' to cancel)`);
    }
    afterTrackAction = AfterTrackAction.Quit;
  }
};

const playListKeys: IKeyMapping[] = [
  { key: {sequence: 'r'}, func: doResume, help: 'cancel pause/quit'},
  { key: {sequence: 'Q'}, func: doQuitAfter, help: 'quit after current track' },
  { key: {sequence: 'P'}, func: doPauseAfter, help: 'pause after current track' },
];

const afterTrack = async (name: string, plays: number): Promise<void> => {
  switch (afterTrackAction) {
    case AfterTrackAction.Next:
      return doPlayList(name, plays);

    case AfterTrackAction.Pause:
      process.stdout.clearLine(0);
      print(' [PAUSED]', 'paused');
      process.stdout.cursorTo(0);
      await new Promise((resolve, reject) => setTimeout(resolve, 500));
      return afterTrack(name, plays);

    case AfterTrackAction.Quit:
      process.exit(0);
  }
};

export const playList = async (name: string) => doPlayList(name, 0);

const doPlayList = async (name: string, plays: number) : Promise<void> => {
  const playlist = find(name);
  if (!playlist) {
    error(`Could not find playlist "${name}"`);
    return;
  }
  const sorted = track.sort(playlist.orderBy);
  const lastIndex = playlist.lastPlayed ? _.findIndex(sorted, (track) => track.trackPath === playlist.lastPlayed) : -1;
  const nextIndex = (lastIndex >= sorted.length - 1) ? 0 : lastIndex + 1; 
  const next = sorted[nextIndex];
  if (plays % (process.stdout.rows || 1) === 0) {
    displayHeaders(playlist);
  }
  displayColumns(playlist, next, nextIndex);
  const trackPath = next.trackPath;
  afterTrackAction = AfterTrackAction.Next;
  playListKeys.forEach((km) => keypress.addKey(km));
  await play(trackPath);
  save({ ...playlist, lastPlayed: trackPath });
  return afterTrack(name, plays + 1);
};

const displayColumns = (playlist: IPlayList, t: track.ITrack, index: number) => {
  if (!playlist.columns) {
    return;
  }
  const displays = track.makeDisplay(t, index);
  const o = new SegOut();
  process.stdout.cursorTo(0);
  process.stdout.clearLine(0);
  const sep = playlist.separator || '|';
  playlist.columns.map((c) => 
    o.add(
      formatColumn(c, displays, sep.length), 
      sep, 
      undefined,
      c.theming ?? playlist.theming,
      playlist.separatorTheming ?? playlist.theming,
    )
  );
  o.nl();
}

const displayHeaders = (playlist: IPlayList) => {
  if (!playlist.columns) {
    return;
  }
  const o = new SegOut();
  process.stdout.cursorTo(0);
  process.stdout.clearLine(0);
  const sep = playlist.separator || '|';
  playlist.columns.map((c) => 
    o.add(
      setWidth(c.header ?? '', c.width ?? '', sep.length),
      sep, 
      undefined,
      c.theming ?? playlist.theming,
      playlist.separatorTheming ?? playlist.theming,
    )
  );
  o.nl();
}

const formatColumn = (
  column: IPlayListColumn, 
  displays: track.ITrackDisplay,
  sepLength: number,
) => {
  try {
    const text = _.template(column.template)(displays);
    return setWidth(text, column.width ?? '', sepLength);
  } catch (e) {
    return 'ERR!';
  }
}

const setWidth = (text: string, width: string, sepLength: number) => {
  if (!width) {
    return text;
  }
  const widths = width.split(':');
  if (widths.length === 1) {
    return padOrTruncate(text, Math.max(0,parseWidth(widths[0], sepLength)));
  } else {
    const [ minWidth, maxWidth ] = widths.slice(0,2)
      .map((w) => parseWidth(w, sepLength));
    return (maxWidth > 0 && maxWidth < text.length) ?
      padOrTruncate(text, maxWidth) :
      (minWidth > text.length) ?
        padOrTruncate(text, minWidth) :
        text;
  }
};

const parseWidth = (widthText: string, sepLength: number): number => {
  const p = widthText.match(/(\d+)%/);
  if (p) {
    const pct = Number(p[1]);
    return Math.round(process.stdout.columns * pct / 100) - sepLength;
  } else {
    return parseInt(widthText, 10);
  }
};

const padOrTruncate = (text: string, width: number) =>
  (width < text.length) ?
    text.slice(0,width) :
    (text + ' '.repeat(width - text.length));
