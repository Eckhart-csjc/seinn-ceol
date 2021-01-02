import { program } from 'commander';
import * as keypress  from './keypress';
import { play } from './play';
import * as playlist from './playlist';
import { stats } from './stats';
import * as composer from './composer';
import * as track from './track';

keypress.init();
keypress.addKey({
  key: { sequence: 'h' },
  func: () => console.log('h = help, q = quit'),
});
keypress.addKey({
  key: { sequence: 'q' },
  func: () => process.exit(0),
});

program
  .version(require('../package.json').version)
  ;

program
  .command('add [tracks...]')
  .description('add track(s) to the library')
  .action(track.add)
  ;

program
  .command('resolve-composers')
  .description('Resolve composers for tracks whose composer is not on file')
  .action(composer.resolveAll)
  ;

program
  .command('info <track>')
  .description('get track information from a file')
  .action(track.info)
  ;

program
  .command('play <track>')
  .description('play a track of music from a file')
  .action(play)
  ;

program
  .command('play-list <name>')
  .description('play tracks from a playlist')
  .action(playlist.playList)
  ;

program
  .command('stats')
  .description('get general statistics')
  .action(stats)
  ;

const main = async () => {
  if (process.argv.length < 2) {
    return program.outputHelp();
  }
  await program.parseAsync(process.argv);
  process.exit(0);          // Required because keypress starts readline in raw mode
}

main()
