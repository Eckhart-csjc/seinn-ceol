import { program } from 'commander';
import * as track from './track';
const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

program
  .version(require('../package.json').version)
  ;

program
  .command('play <track>')
  .description('play a track of music from a file')
  .action(track.play)
  ;

program
  .command('info <track>')
  .description('get track information from a file')
  .action(track.info)
  ;

const main = async () => {
  if (process.argv.length < 2) {
    return program.outputHelp();
  }
  program.parse(process.argv);
}

main()
