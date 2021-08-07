#!/usr/bin/env node

import { program } from 'commander';

import * as composer from './composer';
import { getSettings } from './config';
import { endTiming,startTiming } from './diagnostics';
import * as keypress  from './keypress';
import { cmdPlay } from './play';
import * as playlist from './playlist';
import { cmdQuery, cmdTag } from './query';
import { cmdShowStats, showDiagnostics } from './stats';
import * as track from './track';
import { ask, clearLine, printLn, quit,start } from './util';

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
        clearLine();
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
  .option('-d, --debug', 'debug mode')
  .option('-D, --diagnostics', 'display diagnostics after execution')
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
  .option('-s, --shuffle', 'shuffle tracks')
  .option('-n, --next <filter>', 'advance to the next track matching the filter')
  .option('-w, --where <filter>', 'additional filter on playlist')
  .option('-b, --browse', 'browse playlist before playing')
  .description('play tracks from a playlist')
  .action(playlist.cmdPlayList)
  ;

program
  .command('query <table>')
  .option('-c, --columns <column...>', 'columns to show (using query syntax)')
  .option('-H, --headings <heading...>', 'overrides for default headings (any blank or not provided will still default)')
  .option('-j, --justification <justifications...>', 'overrides for column justification (left|center|right, can be abbreviated, default: left)')
  .option('-l, --layout <layout>', 'format columns and headings as defined in layout')
  .option('--limit <limit>', 'limit output to n items')
  .option('-O, --order <order>', 'use a named order from the orders file')
  .option('-o, --orderBy <key...>', 'order items.  Each order is a query, optionally followed by a comma and sort order')
  .option('--offset <offset>', 'start at offset (0 is first)')
  .option('-w, --where <filter>', 'filter items to include')
  .description('query table contents')
  .action(cmdQuery)
  ;

program
  .command('remove-deleted')
  .description('remove deleted track files from the tracks list')
  .action(track.cmdRemoveDeleted)
  ;

program
  .command('resolve-composers')
  .description('resolve composers for tracks whose composer is not on file')
  .action(composer.cmdResolveComposers)
  ;

program
  .command('stats')
  .option('-g, --groupBy <group-spec...>', 'fields for sub-group statistics')
  .option('-o, --order <order...>', 'order subgroups by name|time|tracks|plays|playTime, optionally followed by comma and asc/desc',)
  .option('-w, --where <filter...>', 'filter tracks to include in stats, followed by filters for groups (use true or 1 as an "all" placeholder where needed)')
  .option('-l, --limit <n...>', 'limit lists to n items (default for each is unlimited)')
  .description('get statistics')
  .action(cmdShowStats)
  ;

program
  .command('tag <table>')
  .option('-a, --add <tag...>', 'add tags')
  .option('-r, --remove <tag...>', 'remove tags')
  .option('-w, --where <filter>', 'apply tagging to only these items (required)')
  .description('add or remove tags')
  .action(cmdTag)
  ;

const main = async () => {
  if (process.env.SEINN_CEOL_DEBUG === '1') {   // Back door for attaching a debugger
    const { cont } = await ask({
      type: 'confirm',
      name: 'cont',
      message: 'Ready?',
      default: true,
    });
    if (!cont) {
      quit();
    }
  }
  await program.parseAsync(process.argv);
  quit();          // Required because keypress starts readline in raw mode
};

main();
