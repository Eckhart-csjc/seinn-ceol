import * as composer from './composer';
import * as track from './track';
import { error, makeTime, padOrTruncate, print, printLn } from './util';
import * as _ from 'lodash';

const pluralize = require('pluralize');

export const stats = (
  options: {summary?: boolean, composers?: string, limit?: number}
) => {
  const trackStats = track.stats();
  const composerStats = composer.stats();
  if (options.summary) {
    printLn(`${pluralize('track', trackStats.nTracks, true)} from ${pluralize('composer', composerStats.nComposers, true)}, Total time: ${makeTime(trackStats.totalTime * 1000)}`);
    printLn('');
  }
  if (options.composers) {
    const counts: Record<string, (d: composer.IComposerStatsDetail) => number> = {
      'time': (d) => d.totalTime * 1000,
      'tracks': (d) => d.nTracks,
      'albums': (d) => d.albums.length,
      'plays': (d) => d.totalPlays,
    };
    const orderer = counts[options.composers];
    if (!orderer) {
      error(`Invalid option for --composers ("time", "tracks", "plays", or "albums" expected)`);
      return;
    }
    const counted: Array<{n: number; name: string;}> = 
      _.orderBy(
        composerStats.detail.map((d) => ({ n: orderer(d), name: d.name })),
        ['n'], ['desc']
      );
    const toPrint = options.limit ? counted.slice(0, options.limit) : counted;
    print(options.limit ? `Top ${options.limit} c` : 'C');
    printLn(`omposers by ${options.composers}`);
    printLn('');
    const longest = toPrint.reduce((acc, d) => (d.name.length > acc) ? d.name.length : acc, 0);
    toPrint.map((d) => {
      const name = padOrTruncate(d.name, longest);
      const value = padOrTruncate(options.composers === 'time' ? makeTime(d.n) : `${d.n}`, 
        12, 'right');
      printLn(`${name} ${value}`);
    });
  }
}
