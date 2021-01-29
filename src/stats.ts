import * as composer from './composer';
import * as track from './track';
import { makeTime, padOrTruncate, printLn } from './util';
import * as _ from 'lodash';

export const stats = () => {
  const trackStats = track.stats();
  const composerStats = composer.stats();
  printLn(`Tracks: ${trackStats.nTracks} from ${composerStats.nComposers} composers, Total time: ${makeTime(trackStats.totalTime * 1000)}`);
  printLn('');
  printLn(`Top 10 composers by total time:`);
  printLn(`-------------------------------`);
  _.orderBy(composerStats.detail, ['totalTime'], ['desc']).slice(0,20).map((d) => 
  printLn(`${padOrTruncate(d.name, process.stdout.columns / 2)} ${makeTime(d.totalTime * 1000)}`));
}
