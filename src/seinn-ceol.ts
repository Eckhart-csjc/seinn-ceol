import { program } from 'commander';
import { getSettings } from './config';
import * as composer from './composer';
import * as keypress  from './keypress';
import { play } from './play';
import * as playlist from './playlist';
import { query } from './query';
import { stats } from './stats';
import * as track from './track';
import { printLn } from './util';

getSettings();      // Make sure we can read config.json, even if we don't need it yet
keypress.init();
keypress.addKeys(
  keypress.makeKeys([
    {
      name: 'help',
      func: () => { 
        process.stdout.clearLine(0); 
        printLn(keypress.makeHelpText().join(', '), 'help');
      },
      help: 'help',
    },
    {
      name: 'quit',
      func: () => process.exit(0),
      help: 'quit',
    }
  ])
);

program
  .version(require('../package.json').version)
  ;

program
  .command('add [tracks...]')
  .option('--noError', `ignore files that are not music tracks without error`)
  .option('--noWarn', `ignore previously added tracks without warning`)
  .description('add track(s) to the library')
  .action(track.add)
  ;

program
  .command('add-all <directory>')
  .option('--noError', `ignore files that are not music tracks without error`)
  .option('--noWarn', `ignore previously added tracks without warning`)
  .description('add all files in a directory (and sub-directories)')
  .action(track.addAll)
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
  .command('remove-deleted')
  .description('Remove deleted track files from the tracks list')
  .action(track.removeDeleted)
  ;

program
  .command('resolve-composers')
  .description('Resolve composers for tracks whose composer is not on file')
  .action(composer.resolveAll)
  ;

program
  .command('query <table>')
  .option('-c, --columns <columns...>', 'Columns to show (using query syntax)')
  .option('-o, --order <order...>', 'Order items by query',)
  .option('-w, --where <filter>', 'Filter items to include')
  .option('-O, --offset <offset>', 'Start at offset (0 is first)')
  .option('-l, --limit <limit>', 'Limit output to n items')
  .description('query table contents')
  .action(query)
  ;

program
  .command('stats')
  .option('-g, --groupBy <group-spec...>', 'Fields to create sub-group statistics')
  .option('-o, --order <order>', 'Order subgroups by name|time|tracks|plays|playTime',)
  .option('-w, --where <filter>', 'Filter tracks to include in stats')
  .option('-l, --limit <n>', 'Limit each list to n items')
  .description('get statistics')
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
