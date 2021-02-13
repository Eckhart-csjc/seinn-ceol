import * as composer from './composer';
import * as track from './track';
import { error, makeTime, padOrTruncate, print, printColumns, printLn } from './util';
import * as _ from 'lodash';

const capitalize = require('capitalize');
const pluralize = require('pluralize');

interface IGroupStats {
  name: string;
  nTracks: number;
  totalTime: number;
  totalPlays: number;
  grouping?: string;
  groups?: Record<string, IGroupStats>;
}

const orders: Record<string, keyof IGroupStats> = {
  name: 'name',
  time: 'totalTime',
  tracks: 'nTracks',
  plays: 'totalPlays',
};

export const stats = (
  options: {
    groupBy?: string,
    order?: string,
    where?: string,
    limit?: number
  }
) => {
  const tracks = track.filter(options.where);
  const groups = options.groupBy?.split(':') ?? [] as string[];
  const composerIndex = composer.indexComposers();
  const orderBy = options.order ? (orders[options.order] ?? 'name') : 'name';
  const stats = tracks.reduce(
    (accum, t, ndx) => addStats(
      accum, 
      t, 
      track.makeDisplay(track.makeTrackSort(t, composerIndex), ndx), 
      groups
    ), 
    makeGroup('Totals', groups)
  );
  const rows = [
    [ `  ${groups.map(headerCaps).join('/')}`, `Tracks`, `Time`, `Plays`],
    [ `` ],
    ...formatGroup(stats, orderBy),
  ];
  printColumns(rows, ['left', 'right', 'right', 'right']);
};

const headerCaps = (text: string) => capitalize.words(text.replace(/([A-Z])/g, ' $1'));

const makeGroup = (name: string, groups: string[]) => ({
  name,
  nTracks: 0,
  totalTime: 0,
  totalPlays: 0,
  ...((groups.length > 0) ? {
    grouping: groups[0],
    groups: {} as Record<string, IGroupStats>,
  } : {})
});

const addStats = (
  existing: IGroupStats, 
  t: track.ITrack, 
  td: track.ITrackDisplay, 
  groups: string[]
): IGroupStats => ({
  ...existing,
  nTracks: existing.nTracks + 1,
  totalTime: existing.totalTime + (t.duration ?? 0) * 1000,
  totalPlays: existing.totalPlays + t.plays,
  ...(existing.grouping ? {
    groups: addGroupStats(existing.grouping, existing.groups ?? {}, t, td, groups.slice(1)),
  } : {}),
});

const addGroupStats = (
  grouping: string, 
  groups: Record<string, IGroupStats>, 
  t: track.ITrack,
  td: track.ITrackDisplay, 
  remainingGroups: string[]
) => {
  const name = (td as unknown as Record<string, string>)[grouping];
  return name ? {
     ...groups,
     [name] : addStats(groups[name] ?? makeGroup(name, remainingGroups), t, td, remainingGroups),
  } : groups;
};

const formatGroup = (
  stats: IGroupStats, 
  orderBy: keyof IGroupStats, 
  indent: number = 0
): string[][] => {
  const base = [ 
    ' '.repeat(indent) + stats.name, 
    `${stats.nTracks}`, 
    makeTime(stats.totalTime), 
    `${stats.totalPlays}` 
  ];
  return stats.groups ?
    _.orderBy(
      _.values(stats.groups), 
      [ orderBy ], 
      [ (orderBy === 'name') ? 'asc' : 'desc']
    )
      .reduce(
        (accum, group) => [ ...accum, ...formatGroup(group, orderBy, indent + 2) ],
        [ base ]
      ) : [ base ];
};
