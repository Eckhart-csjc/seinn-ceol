import * as _ from 'lodash';
import { ArrayFileHandler } from './array-file-handler';
import { getSettings, Theming } from './config';
import { extract, parseExtractor } from './extractor';
import { SegOut } from './segout';
import * as track from './track';
import { 
  addProgressSuffix,
  Justification, 
  makeString,
  padOrTruncate, 
  warning 
} from './util';

export interface ILayout {
  name: string;           // Name of this layout
  columns?: ILayoutColumn[];  // Columns to display
  theming?: Theming;      // General theming for display
  hdrTheming?: Theming;   // Theming for header
  separator?: string;     // Column separator (default is '|')
  separatorTheming?: Theming; // Theming for separator
  hdrSeparatorTheming?: Theming; // Theming for separator in header
}

export interface ILayoutColumn {
  header: string;         // Text for column header
  extractor: string;      // extractor against ITrackHydrated
  width?: string;         // "N", "N%", or range of these separated by ":" (both optional)
  theming?: Theming;      // Theming override for this column only
  hdrTheming?: Theming;   // Theming override for header 
  justification?: Justification;    // Justification of both column and header (def = left)
};

const layoutFile = new ArrayFileHandler<ILayout>('layouts.json');

export const fetchAll = () => layoutFile.fetch();

export const find = (name: string, layouts?: ILayout[]) => 
  _.find(layouts ?? fetchAll(), (layout) => layout.name === name);
export const save = (layout: ILayout) => {
  const layouts = fetchAll();
  const existing = find(layout.name, layouts);
  if (existing) {
    _.merge(existing, layout);
    layoutFile.save(layouts);
  } else {
    layoutFile.save([ ...layouts, layout ]);
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

export const displayColumns = (
  t: track.ITrackHydrated, 
  layoutName?: string
) => {
  const layout = getLayout(layoutName);
  if (!layout?.columns) {
    return;
  }
  const o = new SegOut();
  process.stdout.cursorTo(0);
  process.stdout.clearLine(0);
  const sep = layout.separator || '|';
  layout.columns.map((c) => 
    o.add(
      formatColumn(c, t, sep.length), 
      sep, 
      undefined,
      c.theming ?? layout.theming,
      layout.separatorTheming ?? layout.theming,
    )
  );
  o.nl();
}

export const displayHeaders = (layoutName?: string) => {
  const layout = getLayout(layoutName);
  if (!layout?.columns) {
    return;
  }
  const o = new SegOut();
  process.stdout.cursorTo(0);
  process.stdout.clearLine(0);
  const sep = layout.separator || '|';
  layout.columns.map((c) => 
    o.add(
      setWidth(c.header ?? '', c.width ?? '', sep.length, c.justification),
      sep, 
      undefined,
      c.hdrTheming ?? layout.hdrTheming ?? c.theming ?? layout.theming,
      layout.hdrSeparatorTheming ?? layout.hdrTheming ?? layout.separatorTheming ?? layout.theming,
    )
  );
  o.nl();
}

const getLayout = (layoutName?: string): ILayout | undefined => {
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

export const getCacheStats = () => layoutFile.getCacheStats();
