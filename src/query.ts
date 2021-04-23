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
  Justification,
  notification,
  padOrTruncate,
  printLn
} from './util';
const pluralize = require('pluralize');

const tableMap: Record<string, { filter: (where?: string) => object[]; }> = {
  composers: composer,
  layouts: layout,
  playlists: playlist,
  tracks: track,
};

export const query = (
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
  const tableHandler = tableMap[table.toLowerCase()];
  if (!tableHandler) {
    error(`Unknown table: ${table}`);
    return;
  }
  const items = tableHandler.filter(options.where);
  const sorted = sortBy(items, options.order);
  const limited = (options.offset || options.limit) ? 
    sorted.slice(parseInt(options.offset || '0', 10), parseInt(options.offset || '0', 10) + (parseInt(options.limit || '0', 10) || sorted.length)) : 
    sorted;
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
  notification(pluralize(table.replace(/s$/, ''), limited.length, true));
};

const sortBy = (items: object[], sortKeys: string[] = []) => {
  const sortParsers = sortKeys.map((k) => parseExtractor(k)).filter((p) => !!p);
  return (sortParsers.length ?
    _.sortBy(
      items,
      sortParsers.map((p) => (i:object) => extract(i, p!)),
    ) : items)
  .map((i, index) => ({ ...i, index }));
};

const makeJustification = (justification?: string): Justification =>
  ((justification && 
    _.find(['left', 'center', 'right'], (v) => v.startsWith(justification.toLowerCase()))) ?? 
      'left') as Justification;

const queryMakeString = (val: any) => (typeof val === 'object') ? JSON.stringify(val) : `${val}`;
