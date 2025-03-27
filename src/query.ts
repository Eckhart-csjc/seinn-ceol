import * as _ from 'lodash';

import * as composer from './composer';
import * as config from './config';
import { extract, parseExtractor } from './extractor';
import * as layout from './layout';
import { makeKeys } from './order';
import * as playlist from './playlist';
import { SegOut } from './segout';
import * as track from './track';
import {
  ask,
  error,
  ISortable,
  Justification,
  notification,
  padOrTruncate,
  pbcopy,
  printLn,
  sortBy,
} from './util';
const pluralize = require('pluralize');

export interface ITagable {
  tags?: string[];
}

export interface ITableHandler {
  filter: (where?: string) => ISortable[];
  update: (updates: ITagable[]) => ITagable[];
}

const tableMap: Record<string, ITableHandler> = {
  composers: composer,
  layouts: layout,
  playlists: playlist,
  tracks: track,
};

export const getTableHandler = (table: string) => tableMap[table.toLowerCase()];

export const cmdQuery = (
  table: string,
  options: {
    layout?: string;
    columns?: string[];
    order?: string;
    orderBy?: string[];
    where?: string;
    offset?: string;
    limit?: string;
    headings?: string[];
    justification?: string[];
    gaps?: string[];
  }
) => {
  const tableHandler = getTableHandler(table);
  if (!tableHandler) {
    error(`Unknown table: ${table}`);
    return;
  }
  const items = tableHandler.filter(options.where);
  const keys = [
    ...(options.order ? makeKeys(options.order) : []),
    ...(options.orderBy ?? []),
  ];
  const sorted = sortBy<ISortable>(items, keys);     // Still want indexing
  const limited = (options.offset || options.limit) ?
    sorted.slice(parseInt(options.offset || '0', 10), parseInt(options.offset || '0', 10) + (parseInt(options.limit || '0', 10) || sorted.length)) :
    sorted;
  if (limited.length > 0) {
    const columns = options.columns ?? (options.layout ? [] : limited.reduce<string[]>((accum, i) => _.uniq([ ...accum, ...Object.keys(i) ]), []));
    const colp = columns.map((c) => parseExtractor(c));
    const rows = [
      columns.map((c, ndx) => options.headings?.[ndx] || c),
      ...limited.map((i) => columns.map((_c,cndx) => colp[cndx] ? queryMakeString(extract(i, colp[cndx]!)) : '#ERR')),
    ];
    const maxs = rows.reduce<number[]>((acc, r) =>
      columns.map((_c, ndx) => Math.max(acc[ndx] ?? 0, r[ndx]?.length ?? 0)),
    [] as number[]);
    const justification = columns.map((_c, ndx) => makeJustification(options.justification?.[ndx]));
    const theme = config.getTheme();
    const theLayout = options.layout ? layout.getLayout(options.layout) : undefined;
    const out = new SegOut();

    const addField = (c: string, ndx: number, theming?: config.Theming, separatorTheming?: config.Theming, prefixTheming?: config.Theming) =>
      out.add(padOrTruncate(c, maxs[ndx] || 0, justification[ndx]), 
        theLayout?.separator ?? '│', theLayout?.prefix, theming, separatorTheming, prefixTheming);

    if (options.layout) {
      layout.displayHeaders(options.layout, out);
    }
    if (columns.length) {
      rows[0].map((c, ndx) => addField(c, ndx,
        theLayout?.hdrTheming ?? theLayout?.theming ?? theme.greenBarHeader ?? theme.greenBar1,
        theLayout?.hdrSeparatorTheming ?? theLayout?.hdrTheming ?? theLayout?.separatorTheming ?? theLayout?.theming,
        theLayout?.prefixTheming ?? theLayout?.hdrTheming ?? theLayout?.theming));
    }
    out.nl();

    limited.map((i, n) => {
      if (options.layout) {
        layout.displayColumns(i, options.layout, out);
      }
      if (columns.length) {
        const rownum = n + 1;
        rows[rownum]?.map((c, ndx) => addField(c, ndx,
          theLayout?.theming ?? ((rownum % 2 == 0) ? theme.greenBar1 : theme.greenBar2),
          theLayout?.separatorTheming ?? theLayout?.theming,
          theLayout?.prefixTheming ?? theLayout?.theming));
      }
      out.nl();
    });
    printLn('');
    options.gaps?.map((c) => {
      const p = parseExtractor(c);
      if (p) {
        const values = _.compact(limited.map((item) => extract(item, p))).filter((v) => _.isNumber(v)) as number[];
        if (values.length) {
          const { gaps } = values.sort((a,b) => a > b ? 1 : a < b ? -1 : 0).reduce<{ lastSeen: number, gaps: string[] }>((a, v) => ({
            lastSeen: v,
            gaps: (v > a.lastSeen + 1) ?
              ([ ...a.gaps, `${a.lastSeen + 1}` + ((v - a.lastSeen > 2) ? `-${v - 1}` : '') ])
              : a.gaps,
          }), { lastSeen: 0, gaps: [] }) as { lastSeen: number, gaps: string[] };
          printLn(`Gaps in ${c}: ${gaps.join(', ') || 'none'}`);
        } else {
          error(`${c} results in only non-numeric values; cannot compute gaps`);
        }
      }
      printLn('');
    });
  }
  notification(pluralize(table.replace(/s$/, ''), limited.length, true));
};

export const cmdTag = (
  table: string,
  options: {
    add?: string[];
    remove?: string[];
    where?: string;
  }
) => {
  const tableHandler = getTableHandler(table);
  if (!tableHandler) {
    error(`Unknown table: ${table}`);
    return;
  }
  if (!options.where) {
    error(`--where option is required (use 'true' if you really want to affect all ${table})`);
    return;
  }
  const items = tableHandler.filter(options.where);
  const updates = items.map((i) => ({
    ...i,
    tags: _.difference(_.union(i.tags ?? [], options.add ?? []), options.remove ?? []),
  }));
  tableHandler.update(updates);
};

export const cmdUpdate = (
  table: string,
  path: string,
  value: string,
  options: {
    where?: string;
    json?: boolean;
  },
) => {
  const tableHandler = getTableHandler(table);
  if (!tableHandler) {
    error(`Unknown table: ${table}`);
    return;
  }
  if (!options.where) {
    error(`--where option is required (use 'true' if you really want to affect all ${table})`);
    return;
  }
  const items = tableHandler.filter(options.where);
  const val = options.json ? JSON.parse(value) : value;
  const updates = items.map((i) => _.set(i, path, val));
  tableHandler.update(updates);
  printLn(`Updated ${updates.length} ${table}`);
}

export const cmdInput = async (
  table: string,
  prompt: string,
  path: string,
  options: {
    copy?: string;
    json?: boolean;
    limit?: string;
    offset?: string;
    order?: string;
    orderBy?: string[];
    where?: string;
  }
) => {
  const tableHandler = getTableHandler(table);
  if (!tableHandler) {
    error(`Unknown table: ${table}`);
    return;
  }
  const items = tableHandler.filter(options.where);
  const keys = [
    ...(options.order ? makeKeys(options.order) : []),
    ...(options.orderBy ?? []),
  ];
  const sorted = sortBy<ISortable>(items, keys);     // Still want indexing
  const limited = (options.offset || options.limit) ?
    sorted.slice(parseInt(options.offset || '0', 10), parseInt(options.offset || '0', 10) + (parseInt(options.limit || '0', 10) || sorted.length)) :
    sorted;
  const promptExtractor = parseExtractor(prompt);
  const copyExtractor = options.copy ? parseExtractor(options.copy) : promptExtractor;
  if (!promptExtractor || !copyExtractor) {
    return;  // parse error already emitted
  }
  await limited.reduce(async (acc, i) => {
    await acc;
    const copy = extract(i, copyExtractor);
    if (copy) {
      pbcopy(`${copy}`);
    }
    const { input } = await ask([
      {
        name: 'input',
        type: 'input',
        message: extract(i, promptExtractor),
        default: _.get(i, path),
      }
    ]);
    const data = options.json ? JSON.parse(input) : input;
    _.set(i, path, data);
    tableHandler.update([i]);
  }, Promise.resolve());
};

const makeJustification = (justification?: string): Justification =>
  ((justification &&
    _.find(['left', 'center', 'right'], (v) => v.startsWith(justification.toLowerCase()))) ??
      'left') as Justification;

const queryMakeString = (val: any) => (typeof val === 'object') ? JSON.stringify(val) : `${val}`;
