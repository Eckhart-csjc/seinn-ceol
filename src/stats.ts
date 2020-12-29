import * as composer from './composer';
import * as track from './track';
import { makeTime } from './util';

export const stats = () => {
  const trackStats = track.stats();
  const composerStats = composer.stats();
  console.log(`Tracks: ${trackStats.nTracks} from ${composerStats.nComposers} composers, Total time: ${makeTime(trackStats.totalTime * 1000)}`);
}
