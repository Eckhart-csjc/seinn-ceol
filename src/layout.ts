import * as _ from 'lodash';

import { ArrayFileHandler } from './array-file-handler';
import { getSettings, Theming } from './config';
import { extract, parseExtractor } from './extractor';
import { ITagable } from './query';
import { SegOut } from './segout';
import * as track from './track';
import {
  addProgressSuffix,
  eraseLine,
  Justification,
  makeString,
  merge,
  padOrTruncate,
  warning
} from './util';

export interface ILayout extends ITagable {
  name: string;           // Name of this layout
  columns?: ILayoutColumn[];  // Columns to display
  theming?: Theming;      // General theming for display
  hdrTheming?: Theming;   // Theming for header
  separator?: string;     // Column separator (default is '|')
  separatorTheming?: Theming; // Theming for separator
  hdrSeparatorTheming?: Theming; // Theming for separator in header
  prefix?: string;        // Line prefix
  prefixTheming?: Theming;  // Theming for prefix
}

export interface ILayoutColumn {
  header: string;         // Text for column header
  extractor: string;      // extractor against ITrackHydrated
  width?: string;         // "N", "N%", or range of these separated by ":" (both optional)
  theming?: Theming;      // Theming override for this column only
  hdrTheming?: Theming;   // Theming override for header
  justification?: Justification;    // Justification of both column and header (def = left)
};

let theFile: ArrayFileHandler<ILayout> | undefined;
const layoutFile = () => theFile ||= new ArrayFileHandler<ILayout>('layouts.json');

export const fetchAll = () => layoutFile().fetch();

export const find = (name: string, layouts?: ILayout[]) =>
  _.find(layouts ?? fetchAll(), (layout) => layout.name === name);
export const save = (layout: ILayout) => {
  const layouts = fetchAll();
  const existing = find(layout.name, layouts);
  if (existing) {
    merge(existing, layout);
    layoutFile().save(layouts);
  } else {
    layoutFile().save([ ...layouts, layout ]);
  }
};

export const filter = (where?: string): ILayout[] => {
  const token = where && parseExtractor(where);
  if (where && !token) {
    return [];      // A Parse error occurred
  }
  const layouts = fetchAll();
  return token ?
    layouts.filter((t) => !!extract(t, token)) :
    layouts;
};

export const updateLayouts = (updates: ILayout[]): ILayout[] => {
  const layouts = fetchAll();
  const updated = updates.reduce((accum, u) => {
    const oldLayout = _.find(layouts, (l) => l.name === u.name);
    if (oldLayout) {
      return [...accum, merge(oldLayout, u) ];     // mutates oldLayout, and thus layouts (this is to maintain order)
    } else {
      warning(`Layout "${u.name}" not found -- adding`);
      layouts.push(u);
      return [...accum, u ];
    }
  }, [] as ILayout[]);
  layoutFile().save(layouts);
  return updated;
};

export const update = (updates: object[]): ILayout[] => updateLayouts(updates as ILayout[]);

export const displayColumns = (
  t: track.ITrackHydrated,
  layoutName?: string
) => {
  const o = new SegOut();
  eraseLine();
  const layout = getLayout(layoutName);
  if (!layout?.columns) {
    return;
  }
  const columns = formatColumns(t, layout);
  const sep = layout.separator || '|';
  columns.map((c, ndx) =>
    o.add(
      c,
      sep,
      layout.prefix,
      layout.columns?.[ndx]?.theming ?? layout.theming,
      layout.separatorTheming ?? layout.theming,
      layout.prefixTheming ?? layout.theming,
    )
  );
  o.nl();
};

export const formatColumns = (
  t: track.ITrackHydrated,
  layOut?: string | ILayout,
): string[] => {
  const layout = typeof layOut === 'object' ? layOut : getLayout(layOut);
  if (!layout?.columns) {
    return [];
  }
  const sep = layout.separator || '|';
  return layout.columns.map((c) => formatColumn(c, t, sep.length));
};

export const displayHeaders = (layoutName?: string) => {
  const layout = getLayout(layoutName);
  if (!layout?.columns) {
    return;
  }
  const o = new SegOut();
  eraseLine();
  const sep = layout.separator || '|';
  layout.columns.map((c) =>
    o.add(
      setWidth(c.header ?? '', c.width ?? '', sep.length, c.justification),
      sep,
      layout.prefix,
      c.hdrTheming ?? layout.hdrTheming ?? c.theming ?? layout.theming,
      layout.hdrSeparatorTheming ?? layout.hdrTheming ?? layout.separatorTheming ?? layout.theming,
      layout.prefixTheming ?? layout.hdrTheming ?? layout.theming,
    )
  );
  o.nl();
};

export const getLayout = (layoutName?: string): ILayout | undefined => {
  const name = layoutName ?? getSettings().layout;
  if (!name) {
    return undefined;
  }
  const layout = find(name);
  if (!layout) {
    warning(`Layout ${name} not found`);
    return undefined;
  }
  return layout;
};

const formatColumn = (
  column: ILayoutColumn,
  track: track.ITrackHydrated,
  sepLength: number,
) => {
  try {
    const parser = parseExtractor(column.extractor);
    const text = makeString(parser && extract(track, parser));
    return setWidth(text, column.width ?? '', sepLength, column.justification);
  } catch (e) {
    return 'ERR!';
  }
};

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

export const getCacheStats = () => layoutFile().getCacheStats();
