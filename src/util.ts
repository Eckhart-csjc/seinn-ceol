import { applyThemeSetting, Theming } from './config';

let rowsPrinted: number = 0;
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
  return `${ result.rem ? result.rem + ' days, ' : ''}${result.nums.join(':')}`;
};

export const makeProgressBar = (width: number, pct: number) => {
  const ticks = Math.floor(Math.max(0,Math.min(width, Math.floor(width * pct))));
  const togo = width - ticks;
  const block = '\u2588';
  const shade = '\u2592';
  return applyThemeSetting(
    `${ticks ? block.repeat(ticks) : ''}${togo ? shade.repeat(togo) : ''}`,
    'progressBar'
  );
};
