import * as _ from 'lodash';
import { applyThemeSetting, getTheme, Theming } from './config';
import { fixTTY } from './keypress';
const chalk = require('chalk');
const inquirer = require('inquirer');
const pluralize = require('pluralize');

export type Justification = 'left' | 'center' | 'right';

let rowsPrinted: number = 0;
let barSuffix: string = '';

export const getRowsPrinted = () => rowsPrinted;
export const bumpRowsPrinted = (nLines: number = 1) => rowsPrinted += nLines;

export const print = (text: string, theme?: Theming) =>
  process.stdout.write(applyThemeSetting(text, theme));

export const printLn = (text: string, theme?: Theming) => {
  console.log(applyThemeSetting(text, theme));
  bumpRowsPrinted();
}

export const error = (...args: any[]) => {
  console.error(...args.map((a: any) => 
    (typeof a === 'string') ? applyThemeSetting(a, 'error') : a));
  bumpRowsPrinted();      // Potentially innacurate, but as good as we can guess
}
export const warning = (...args: any) => {
  console.warn(...args.map((a: any) => 
    (typeof a === 'string') ? applyThemeSetting(a, 'warning') : a));
  bumpRowsPrinted();
}
export const notification = (...args: any) => {
  console.log(...args.map((a: any) => 
    (typeof a === 'string') ? applyThemeSetting(a, 'notification') : a));
  bumpRowsPrinted();
}

export const debug = (...args: any[]) => {
  if (process.env.DEBUG) {
    console.log(...args);
  }
}

export const printColumns = (
  output: string[][], 
  justification?: Justification[], 
  greenBar?: boolean,
  nmHeaderLines?: number
) => {
  const widths = output.reduce((accum: number[], row) =>
    row.reduce((acc: number[], col, ndx) => {
      acc[ndx] = Math.max(acc[ndx] ?? 0, col.length + 1);
      return acc;
    }, accum), [] as number[]);
  let totalWidth = widths.reduce((acc, col) => acc + col, 0);
  if (!totalWidth) {
    return;
  }
  if (totalWidth > process.stdout.columns) {
    const diff = totalWidth - process.stdout.columns;
    if (widths[0] - 10 > diff) {
      widths[0] = widths[0] - diff;
      totalWidth = totalWidth - diff;
    }
  }
  const finalWidths = (totalWidth > process.stdout.columns) ?
    widths.map((w) => Math.floor(w * process.stdout.columns / totalWidth)) :
    widths;
  const just = finalWidths.map(
    (w,ndx) => justification ? justification[ndx] ?? 'left' : 'left'
  );
  const theme = getTheme();
  output.forEach((row, rownum) =>
    printLn(row.map((col, ndx) => 
      greenBar ?
        applyThemeSetting(
          padOrTruncate(col, finalWidths[ndx], just[ndx]), 
          (theme.greenBarHeader && rownum < (nmHeaderLines ?? 0)) ?
            theme.greenBarHeader :
            ((rownum % 2 == 0) ? theme.greenBar1 : theme.greenBar2)
        ) :
       padOrTruncate(col, finalWidths[ndx], just[ndx])
      ).join('')
    )
  );
}

export const ask = async (questions: any): Promise<any> => {
  const response = await inquirer.prompt(questions);
  fixTTY();
  return response;
}

export const makeString = (input: unknown): string =>
  (input != null) ?
    (Array.isArray(input) ? 
      input.map((e) => `${makeString(e)}`).join(' & ') : 
      (typeof input === 'object' ? 
        JSON.stringify(input) : 
        `${input}`)) :
    '';

export const makeTime = (milli: number) => {
  const result = [
    { t: '', d: 60 },
    { t: ':', d: 60 },
    { t: ':', d: 24 },
  ].reduce<{ nums: string[], rem: number}>((accum, op) => {
    const val = accum.rem % op.d;
    const rem = Math.floor((accum.rem - val) / op.d);
    return {
      nums: (val || rem || op.d === 60) ? [ `0${val}`.substr(-2), ...accum.nums ] : accum.nums,
      rem,
    }
  }, { nums: [], rem: Math.floor(milli / 1000) });
  if (result.nums[0]?.startsWith('0')) {
    result.nums[0] = result.nums[0].slice(1);   // No leading 0 on first time element
  }
  return `${ result.rem ? result.rem + 'd+' : ''}${result.nums.join(':')}`;
};

export const makeProgressBar = (width: number, pct: number, text: string = '') => {
  const body = padOrTruncate(text + barSuffix, width, 'center');
  const ticks = Math.floor(Math.max(0,Math.min(width, Math.floor(width * pct))));
  const togo = width - ticks;
  const theme = getTheme();
  const ticksBar = applyThemeSetting(body.slice(0, ticks), 
    barSuffix ? 
      (theme.progressBarWithMessage ?? theme.progressBar) :
      theme.progressBar);
  const togoBar = applyThemeSetting(body.slice(ticks), 
    barSuffix ?
      (theme.progressBarWithMessageBackground ?? theme.progressBackground) :
      theme.progressBackground);
  return `${ticksBar}${togoBar}`;
};

export const addProgressSuffix = (suffix: string) => barSuffix += suffix;
export const removeProgressSuffix = (suffix: string) => barSuffix = barSuffix.replace(suffix, '');

const ELLIPSIS = '\u2026';

export const padOrTruncate = (text: string, width: number, justification?: Justification) =>
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
