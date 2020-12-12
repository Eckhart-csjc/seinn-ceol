import { program } from 'commander';
import * as keypress  from './keypress';
import * as track from './track';

keypress.init();

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
  await program.parseAsync(process.argv);
  process.exit(0);          // Required because keypress starts readline in raw mode
}

main()
