import * as composer from './composer';
import { extract, IValueToken, parseExtractor } from './extractor';
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
  playTime: number;
  grouping?: IValueToken;
  groups?: Record<string, IGroupStats>;
  index?: number;
}

const orders: Record<string, keyof IGroupStats> = {
  name: 'name',
  time: 'totalTime',
  tracks: 'nTracks',
  plays: 'totalPlays',
  playTime: 'playTime',
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
  const groups: IValueToken[] = (options.groupBy?.split(':') ?? [] as string[])
    .map((g) => parseExtractor(g))
    .filter((g) => !!g) as IValueToken[];
  const composerIndex = composer.indexComposers();
  const orderBy = options.order ? (orders[options.order] ?? 'name') : 'name';
  const stats = tracks.reduce<IGroupStats>(
    (accum, t, ndx) => addStats(
      accum, 
      t, 
      groups
    ), 
    makeGroup('Totals', groups)
  );
  const rows = [
    [ `Rank ${options.groupBy ?? ''}`, `Tracks`, `Time`, `Plays`, `PlayTime`],
    [],
    ...formatGroup(stats, orderBy, options.limit),
  ];
  printColumns(rows, ['left', 'right', 'right', 'right', 'right'], true);
};

const makeGroup = (name: string, groups: IValueToken[]) => ({
  name,
  nTracks: 0,
  totalTime: 0,
  totalPlays: 0,
  playTime: 0,
  ...((groups.length > 0) ? {
    grouping: groups[0],
    groups: {} as Record<string, IGroupStats>,
  } : {})
});

const addStats = (
  existing: IGroupStats, 
  t: track.ITrackHydrated, 
  groups: IValueToken[]
): IGroupStats => ({
  ...existing,
  nTracks: existing.nTracks + 1,
  totalTime: existing.totalTime + (t.duration ?? 0) * 1000,
  totalPlays: existing.totalPlays + t.plays,
  playTime: existing.playTime + (t.playTime ?? 0) * 1000,
  ...(existing.grouping ? {
    groups: addGroupStats(existing.grouping, existing.groups ?? {}, t, groups.slice(1)),
  } : {}),
});

const addGroupStats = (
  grouping: IValueToken, 
  groups: Record<string, IGroupStats>, 
  t: track.ITrackHydrated,
  remainingGroups: IValueToken[]
) => {
  const result = extract(t, grouping);
  const name = (result != null) ?
    (Array.isArray(result) ? result.map((e) => `${e}`).join(' & ') : `${result}`) :
    '';
  return name ? {
     ...groups,
     [name] : addStats(groups[name] ?? makeGroup(name, remainingGroups), t, remainingGroups),
  } : groups;
};

const formatGroup = (
  stats: IGroupStats, 
  orderBy: keyof IGroupStats, 
  limit: number = 0,
  indent: number = 0,
  indexPad: number = 0,
): string[][] => {
  const base = [ 
    ' '.repeat(indent) +
      `${stats.index ?? ''}`.padStart(indexPad,' ') +
      ` ${stats.name}`, 
    `${stats.nTracks}`, 
    makeTime(stats.totalTime), 
    `${stats.totalPlays}`,
    makeTime(stats.playTime),
  ];
  return stats.groups ?
    _.orderBy(
      _.values(stats.groups), 
      [ orderBy ], 
      [ (orderBy === 'name') ? 'asc' : 'desc']
    )
    .slice(0, limit || Infinity)
    .map((s, index) => ({ ...s, index: index + 1 }))
    .reduce(
      (accum, group, ndx, arry) => [ 
        ...accum, 
        ...formatGroup(group, orderBy, limit, indent + indexPad + 1, `${arry.length}`.length) 
      ],
      [ base ]
    ) 
  : [ base ];
};
