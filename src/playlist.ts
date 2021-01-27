import * as _ from 'lodash';
import { ArrayFileHandler } from './array-file-handler';
import { Theming } from './config';
import { IKey, IKeyMapping } from './keypress';
import * as keypress from './keypress';
import { isPlaying, stopPlaying, doPlay } from './play';
import { SegOut } from './segout';
import * as track from './track';
import { error, getRowsPrinted, notification, print, warning } from './util';

type Justification = 'left' | 'center' | 'right';

export interface IPlayList {
  name: string;           // Play list name
  orderBy: string[];      // ITrackSort keys for order of play
  current?: string;       // trackPath of track started (undefined to start from the top)
  columns?: IPlayListColumn[];  // Columns to display
  theming?: Theming;       // General theming for display
  hdrTheming?: Theming;   // Theming for header
  separator?: string;     // Column separator (default is '|')
  separatorTheming?: Theming; // Theming for separator
  hdrSeparatorTheming?: Theming; // Theming for separator in header
}

export interface IPlayListColumn {
  header: string;         // Text for column header
  template: string;       // lodash template against track.ITrackDisplay
  width?: string;         // "N", "N%", or range of these separated by ":" (both optional)
  theming?: Theming;      // Theming override for this column only
  hdrTheming?: Theming;   // Theming override for header 
  justification?: Justification;    // Justification of both column and header (def = left)
};

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

const doNext = (key: IKey) => {
  afterTrackAction = AfterTrackAction.Next;
  stopPlaying();
};

const doPauseAfter = (key: IKey) => {
  if (afterTrackAction !== AfterTrackAction.Pause) {
    process.stdout.clearLine(0);
    notification(`Will pause after current track (press 'r' to cancel)`);
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

const afterTrack = async (name: string, plays: number): Promise<void> => {
  switch (afterTrackAction) {
    case AfterTrackAction.Next: {
      const playlist = find(name);
      if (!playlist) {
        error(`Playlist ${name} no longer exists`);
        process.exit(0);
      }
      const sorted = track.sort(playlist.orderBy);
      const lastIndex = playlist.current ? 
        _.findIndex(sorted, (tr) => tr.trackPath === playlist.current) :
        -1;
      if (lastIndex < 0) {
        warning(`Current track not found in playlist, going to first`);
      }
      const nextIndex = (lastIndex >= sorted.length - 1) ? 0 : lastIndex + 1; 
      return doPlayList(name, plays, sorted[nextIndex]);
    }

    case AfterTrackAction.Pause: {
      process.stdout.clearLine(0);
      print(' Paused', 'paused');
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
      const sorted = track.sort(playlist.orderBy);
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
      process.exit(0);
    }
  }
};

export const playList = async (name: string) => doPlayList(name, 0);

export const getCurrentTrack = (playlist: IPlayList) =>
  playlist.current ? 
    (track.findTrack(playlist.current) ?? getTrackByIndex(playlist, 0)) :
    getTrackByIndex(playlist, 0);

const getTrackByIndex = (playlist: IPlayList, index: number) => track.sort(playlist.orderBy)[index];

const getTrackIndex = (playlist: IPlayList, t: track.ITrackSort) =>
  _.findIndex(track.sort(playlist.orderBy), (tr) => tr.trackPath === t.trackPath);

const doPlayList = async (name: string, plays: number, nextTrack?: track.ITrackSort) : Promise<void> => {
  const playlist = find(name);
  if (!playlist) {
    error(`Could not find playlist "${name}"`);
    return;
  }
  const theTrack = nextTrack ?? getCurrentTrack(playlist);
  if (lastHeaderRow === 0 || (getRowsPrinted() - lastHeaderRow) >= (process.stdout.rows-3)) {
    displayHeaders(playlist);
  }
  displayColumns(playlist, theTrack);
  const trackPath = theTrack.trackPath;
  save({ ...playlist, current: trackPath });
  afterTrackAction = AfterTrackAction.Next;

  const playListKeys: IKeyMapping[] = [
    { key: {sequence: 'j'}, func: doNext, help: 'next track' },
    { key: {sequence: 'k'}, func: doPrevious, help: 'previous track' },
    { key: {sequence: 'r'}, func: doResume, help: 'cancel pause/quit'},
    { key: {sequence: 'Q', shift: true}, func: doQuitAfter, help: 'quit after current track' },
    { key: {name: 'p'}, func: doPauseAfter, help: 'pause after current track' },
  ];
  playListKeys.forEach((km) => keypress.addKey(km));
  const finished = await doPlay(trackPath);
  await afterTrack(name, plays + (finished ? 1 : 0));
  playListKeys.forEach((km) => keypress.removeKey(km));
  return;
};

const displayColumns = (playlist: IPlayList, t: track.ITrackSort) => {
  if (!playlist.columns) {
    return;
  }
  const displays = track.makeDisplay(t, getTrackIndex(playlist, t));
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
      setWidth(c.header ?? '', c.width ?? '', sep.length, c.justification),
      sep, 
      undefined,
      c.hdrTheming ?? playlist.hdrTheming ?? c.theming ?? playlist.theming,
      playlist.hdrSeparatorTheming ?? playlist.hdrTheming ?? playlist.separatorTheming ?? playlist.theming,
    )
  );
  o.nl();
  lastHeaderRow = getRowsPrinted();
}

const formatColumn = (
  column: IPlayListColumn, 
  displays: track.ITrackDisplay,
  sepLength: number,
) => {
  try {
    const text = _.template(column.template)(displays);
    return setWidth(text, column.width ?? '', sepLength, column.justification);
  } catch (e) {
    return 'ERR!';
  }
}

const setWidth = (
  text: string, 
  width: string, 
  sepLength: number, 
  justification?: Justification
) => {
  if (!width) {
    return text;
  }
  const widths = width.split(':');
  if (widths.length === 1) {
    return padOrTruncate(text, Math.max(0,parseWidth(widths[0], sepLength)), justification);
  } else {
    const [ minWidth, maxWidth ] = widths.slice(0,2)
      .map((w) => parseWidth(w, sepLength));
    return (maxWidth > 0 && maxWidth < text.length) ?
      padOrTruncate(text, maxWidth, justification) :
      (minWidth > text.length) ?
        padOrTruncate(text, minWidth, justification) :
        text;
  }
};

const parseWidth = (widthText: string, sepLength: number): number => {
  const p = widthText.match(/([\d.]+)%/);
  if (p) {
    const pct = Number(p[1]);
    return Math.round(process.stdout.columns * pct / 100) - sepLength;
  } else {
    return parseInt(widthText, 10);
  }
};

const ELLIPSIS = '\u2026';

const padOrTruncate = (text: string, width: number, justification?: Justification) =>
  (width < 1) ? ELLIPSIS :
  ((justification ?? 'left') === 'left') ?
    ((width < text.length) ?
      text.slice(0,width-1) + ELLIPSIS :
      (text + ' '.repeat(width - text.length))
    ) :
    (justification === 'right') ?
      ((width < text.length) ?
        (ELLIPSIS + text.slice(1-width)) :
        (' '.repeat(width - text.length) + text)
      ) :
      (justification === 'center') ?
        ((width < text.length) ?
          ((text.length - width) >= 2 ? ELLIPSIS : '') +
            text.slice(Math.floor((text.length - width) / 2), width - 1) + ELLIPSIS :
          (' '.repeat(Math.floor((width - text.length) / 2)) + 
            text + ' '.repeat(Math.ceil((width - text.length) / 2))
          )
        ) :
          'ERR: justification';
