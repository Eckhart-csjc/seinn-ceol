#!/usr/bin/env node

import { getSettings } from './config';
import * as composer from './composer';
import { startTiming, endTiming } from './diagnostics';
import * as keypress  from './keypress';
import { cmdPlay } from './play';
import * as playlist from './playlist';
import { cmdQuery } from './query';
import { cmdShowStats, showDiagnostics } from './stats';
import * as track from './track';
import { printLn, start, quit } from './util';
import { program } from 'commander';

start();
getSettings();      // Make sure we can read config.json, even if we don't need it yet
keypress.init();
keypress.addKeys(
  keypress.makeKeys([
    {
      name: 'diagnostics',
      func: showDiagnostics,
    },
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
      func: quit,
      help: 'quit',
    }
  ])
);

program
  .option('-D, --diagnostics', 'Display diagnostics after execution')
  .version(require('../package.json').version)
  ;

program
  .command('add [tracks...]')
  .option('--noError', `ignore files that are not music tracks without error`)
  .option('--noWarn', `ignore previously added tracks without warning`)
  .description('add track(s) to the library')
  .action(track.cmdAdd)
  ;

program
  .command('add-all <directory>')
  .option('--noError', `ignore files that are not music tracks without error`)
  .option('--noWarn', `ignore previously added tracks without warning`)
  .description('add all files in a directory (and sub-directories)')
  .action(track.cmdAddAll)
  ;

program
  .command('info <track>')
  .description('get track information from a file')
  .action(track.cmdInfo)
  ;

program
  .command('play <track>')
  .description('play a track of music from a file')
  .action(cmdPlay)
  ;

program
  .command('play-list <name>')
  .option('-s, --shuffle', 'Shuffle tracks')
  .option('-n, --next <filter>', 'Advance to the next track matching the filter')
  .option('-w, --where <filter>', 'Additional filter on playlist')
  .option('-b, --browse', 'Browse playlist before playing')
  .description('play tracks from a playlist')
  .action(playlist.cmdPlayList)
  ;

program
  .command('remove-deleted')
  .description('Remove deleted track files from the tracks list')
  .action(track.cmdRemoveDeleted)
  ;

program
  .command('resolve-composers')
  .description('Resolve composers for tracks whose composer is not on file')
  .action(composer.cmdResolveComposers)
  ;

program
  .command('query <table>')
  .option('-c, --columns <columns...>', 'Columns to show (using query syntax)')
  .option('-H, --headings <headings...>', 'Overrides for default headings (any blank or not provided will still default)')
  .option('-j, --justification <justifications...>', 'Overrides for column justification (left|center|right, can be abbreviated, default: left)')
  .option('-l, --limit <limit>', 'Limit output to n items')
  .option('-o, --order <order...>', 'Order items.  Each order iq a query, optionally followed by a comma and sort order')
  .option('-O, --offset <offset>', 'Start at offset (0 is first)')
  .option('-w, --where <filter>', 'Filter items to include')
  .description('query table contents')
  .action(cmdQuery)
  ;

program
  .command('stats')
  .option('-g, --groupBy <group-spec...>', 'Fields to create sub-group statistics')
  .option('-o, --order <order...>', 'Order subgroups by name|time|tracks|plays|playTime, optionally followed by comma and asc/desc',)
  .option('-w, --where <filter...>', 'Filter tracks to include in stats, followed by filters for groups (use true or 1 as an "all" placeholder where needed)')
  .option('-l, --limit <n...>', 'Limit lists to n items (default for each is unlimited)')
  .description('get statistics')
  .action(cmdShowStats)
  ;

const main = async () => {
  if (process.argv.length < 2) {
    return program.outputHelp();
  }
  await program.parseAsync(process.argv);
  quit();          // Required because keypress starts readline in raw mode
}

main();
