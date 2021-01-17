import { Theming } from './config';
import { print, printLn } from './util';

export class SegOut {
  
  lastCol: number;

  constructor() {
    this.lastCol = 0;
  }

  public add(
    text: string,         // Text to add
    sep?: string,         // Any separator between segments
    prefix?: string,      // Any prefix for each line
    theme?: Theming,      // Any theming for the segment
    sepTheme?: Theming,   // Any theming for the separator
    prefixTheme?: Theming,// Any theming for the prefix
  ) {
    if (this.lastCol > 0 && 
      (this.lastCol + text.length + (sep?.length || 0) > process.stdout.columns)) {
      this.nl();
    }
    if (this.lastCol > 0) {
      if (sep) {
        print(sep, sepTheme);
        this.lastCol += sep.length;
      }
    } else if (prefix) {
      print(prefix, prefixTheme);
      this.lastCol += prefix.length;
    }
    print(text, theme);
    this.lastCol += text.length;
  }

  public nl() {
    printLn('');
    this.lastCol = 0;
  }

}
