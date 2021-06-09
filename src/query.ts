import * as _ from 'lodash';
import * as composer from './composer';
import * as config from './config';
import { extract, parseExtractor } from './extractor';
import * as layout from './layout';
import * as playlist from './playlist';
import { SegOut } from './segout';
import * as track from './track';
import { 
  error, 
  ISortable,
  Justification,
  notification,
  padOrTruncate,
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
    columns?: string[];
    order?: string[];
    where?: string;
    offset?: string;
    limit?: string;
    headings?: string[];
    justification?: string[];
  }
) => {
  const tableHandler = getTableHandler(table);
  if (!tableHandler) {
    error(`Unknown table: ${table}`);
    return;
  }
  const items = tableHandler.filter(options.where);
  const sorted = sortBy<ISortable>(items, options.order ?? []);     // Still want indexing
  const limited = (options.offset || options.limit) ? 
    sorted.slice(parseInt(options.offset || '0', 10), parseInt(options.offset || '0', 10) + (parseInt(options.limit || '0', 10) || sorted.length)) : 
    sorted;
  if (limited.length > 0) {
    const columns = options.columns ?? limited.reduce<string[]>((accum, i) => _.uniq([ ...accum, ...Object.keys(i) ]), []);
    const colp = columns.map((c) => parseExtractor(c));
    const rows = [
      columns.map((c, ndx) => options.headings?.[ndx] || c),
      ...limited.map((i) => columns.map((c,cndx) => colp[cndx] ? queryMakeString(extract(i, colp[cndx]!)) : '#ERR')),
    ];
    const maxs = rows.reduce<number[]>((acc, r) =>
      columns.map((c, ndx) => Math.max(acc[ndx] ?? 0, r[ndx]?.length ?? 0)),
    [] as number[]);
    const justification = columns.map((c, ndx) => makeJustification(options.justification?.[ndx]));
    const theme = config.getTheme();
    const out = new SegOut();
    rows.reduce((acc, r, rownum) => {
      r.reduce((ac, c, ndx) => {
        out.add(padOrTruncate(c, maxs[ndx] || 0, justification[ndx]), '│', undefined, 
          (rownum == 0) ? theme.greenBarHeader ?? theme.greenBar1 :
            ((rownum % 2 == 0) ? theme.greenBar1 : theme.greenBar2));
        return ac;
      }, acc)
      out.nl();
      return acc;
    }, true);
    printLn('');
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

const makeJustification = (justification?: string): Justification =>
  ((justification && 
    _.find(['left', 'center', 'right'], (v) => v.startsWith(justification.toLowerCase()))) ?? 
      'left') as Justification;

const queryMakeString = (val: any) => (typeof val === 'object') ? JSON.stringify(val) : `${val}`;
