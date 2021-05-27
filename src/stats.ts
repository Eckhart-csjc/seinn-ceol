import * as composer from './composer';
import * as config from './config';
import * as diagnostics from './diagnostics';
import { extract, IValueToken, parseCacheStats, parseExtractor } from './extractor';
import * as layout from './layout';
import * as playlist from './playlist';
import * as track from './track';
import { error, makeString, makeTime, notification, padOrTruncate, parseOrder, print, printColumns, printLn } from './util';
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

export const cmdShowStats = (
  options: {
    groupBy?: string[],
    order?: string[],
    where?: string[],
    limit?: number[],
  }
) => {
  const tracks = track.filter(options.where?.[0]);
  const groups: IValueToken[] = (options.groupBy ?? [] as string[])
    .map((g) => parseExtractor(g))
    .filter((g) => !!g) as IValueToken[];
  const composerIndex = composer.indexComposers();
  const order = options.order ?? [] as string[];
  const orderBy = [
    ...order,
    ...Array(Math.max(0, (options.groupBy?.length ?? 0) - order.length)).fill(order[order.length-1] || 'name'),
  ].map((ord) => {
    const [ o, ad ] = parseOrder(ord || 'name');
    return [ orders[o] ?? 'name', ad ?? (o === 'name' ? 'asc' : 'desc') ];
  });
  const stats = tracks.reduce<IGroupStats>(
    (accum, t, ndx) => addStats(
      accum, 
      t, 
      groups
    ), 
    makeGroup('Totals', groups)
  );
  const where = options.where?.slice(1).map((w) => parseExtractor(w));
  const rows = [
    [ `Rank ${options.groupBy ?? ''}`, `Tracks`, `Time`, `Plays`, `PlayTime`],
    ...formatGroup(finalizeStats(stats, where), orderBy, options.limit),
  ];
  printColumns(rows, ['left', 'right', 'right', 'right', 'right'], true, 1);
};

export const cacheStats = () => {
  if (process.stdout.isTTY) {
    process.stdout.clearLine(0);
  }
  const configStats = config.getCacheStats();
  notification('Cache statistics:');
  printColumns([
    ['Source', 'Stores', 'Attempts', 'Hits', '%', 'Misses', '%'],
    ...([
         [ 'tracks file', track.getCacheStats() ],
         [ 'composers file', composer.getCacheStats() ],
         [ 'composer index', composer.composerIndexCacheStats ],
         [ 'playlists file', playlist.getCacheStats() ],
         [ 'layouts file', layout.getCacheStats() ],
         ...(configStats ? [[ 'config file', configStats ]] : []),
         [ 'parse extractors', parseCacheStats ],
       ] as Array<[string, diagnostics.ICacheStats]>).map(([ file, stats ]) => {
         const attempts = stats.hits + stats.misses;
         return [ 
           file, 
           `${stats.stores}`, 
           `${attempts}`, 
           `${stats.hits}`, 
           `${(stats.hits * 100 / attempts).toFixed(1)}`, 
           `${stats.misses}`, 
           `${(stats.misses * 100 / attempts).toFixed(1)}`
         ];
       }),
  ], ['left', 'right', 'right', 'right', 'right', 'right', 'right'], true, 1);
};

interface ISummaryTimings {
  total: number;
  high: number;
  low: number;
}

export const showTimings = () => {
  notification('Timings:');
  const timings = diagnostics.getTimings();
  printColumns([
    ['Name', 'Count', 'Total Ms', 'Avg Ms', 'High Ms', 'Low Ms'],
    ...Object.keys(timings).sort().map((name) => {
      const ta = timings[name].filter((t) => !!t.end);
      const summary = ta.reduce<ISummaryTimings>((acc, t) => {
        const duration = t.end! - t.start;
        return {
          total: acc.total + duration,
          high: Math.max(acc.high, duration),
          low: Math.min(acc.low, duration),
        }
      }, { total: 0, high: 0, low: Infinity });
      return [
        name,
        `${ta.length}`,
        `${summary.total.toFixed(1)}`,
        `${(summary.total / ta.length).toFixed(1)}`,
        `${summary.high.toFixed(1)}`,
        `${summary.low.toFixed(1)}`,
      ];
    })
  ],
  ['left', 'right', 'right', 'right', 'right', 'right'], 
  true, 1
  );
};

export const showDiagnostics = () => {
  cacheStats();
  showTimings();
}

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
  ...(existing.grouping ? {} : {      // When subgroups exist, we will bubble up stats later after filtering
    nTracks: existing.nTracks + 1,
    totalTime: existing.totalTime + (t.duration ?? 0),
    totalPlays: existing.totalPlays + t.plays,
    playTime: existing.playTime + (t.playTime ?? 0),
  }),
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
  const name = makeString(extract(t, grouping)) || '<none>';
  return {
    ...groups,
    [name] : addStats(groups[name] ?? makeGroup(name, remainingGroups), t, remainingGroups),
  };
}

const finalizeStats = (
  stats: IGroupStats,
  where?: Array<IValueToken | undefined>,
): IGroupStats => (stats.grouping && stats.groups) ?
  _.keys(stats.groups).reduce((accum, name) => {
    const g = stats.groups?.[name];
    if (!g) {           // This should never happen, but the compiler isn't smart enough to see that
      return accum;
    }
    const groupStats = finalizeStats(g, where?.slice(1));
    const condition = where?.[0];
    return (!condition || extract({
      ..._.mapValues(orders, (o) => groupStats[o]),   // Allow ordering names to be used here
      ...groupStats,                                  // As well as true field names
    }, condition)) ?
      {
        ...accum,
        nTracks: accum.nTracks + groupStats.nTracks,
        totalTime: accum.totalTime + groupStats.totalTime,
        totalPlays: accum.totalPlays + groupStats.totalPlays,
        playTime: accum.playTime + groupStats.playTime,
        groups: {
          ...accum.groups,
          [name]: groupStats,
        }
      } : accum;
  }, {
    ...stats,
    groups: {} as Record<string, IGroupStats>
  }) : stats;

const formatGroup = (
  stats: IGroupStats, 
  orderBy: string[][],
  limit: number[] = [],
  indent: number = 0,
  indexPad: number = 0,
): string[][] => {
  const base = [ 
    ' '.repeat(indent) +
      `${stats.index ?? ''}`.padStart(indexPad,' ') +
      ` ${stats.name}`, 
    `${stats.nTracks}`, 
    makeTime(stats.totalTime * 1000), 
    `${stats.totalPlays}`,
    makeTime(stats.playTime * 1000),
  ];
  return stats.groups ?
    _.orderBy(
      _.values(stats.groups), 
      ...orderBy[0],
    )
    .slice(0, limit[0] || Infinity)
    .map((s, index) => ({ ...s, index: index + 1 }))
    .reduce(
      (accum, group, ndx, arry) => [ 
        ...accum, 
        ...formatGroup(group, orderBy.slice(1), limit.slice(1), indent + indexPad + 1, `${arry.length}`.length) 
      ],
      [ base ]
    ) 
  : [ base ];
};
