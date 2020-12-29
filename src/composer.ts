import * as dayjs from 'dayjs';
import * as _ from 'lodash';
import { ArrayFileHandler } from './array-file-handler';

const levenshtein = require('js-levenshtein');

export interface IComposer {
  name: string;       // Name as key
  aliases: string[];  // Other ways of representing name
  born: string;       // Valid dayjs input
  died?: string;      // Valid dayjs input, or undefined is still living
}

export interface IComposerStats {
  nComposers: number;
}

const composerFile = new ArrayFileHandler<IComposer>('composers.json');

const indexComposers = () => composerFile.fetch().reduce<Record<string,IComposer>>((accum, composer) => ({
   ...accum,
   [composer.name]: composer,
   ...composer.aliases.reduce<Record<string,IComposer>>((ac, alias) => ({ ...ac, [alias]: composer }), {} as Record<string,IComposer>),
}), {} as Record<string,IComposer>);

export const find = (name: string) => indexComposers()[name];
export const suggest = (name: string) => _.sortBy(composerFile.fetch().map((composer:IComposer) => ({
  distance: [ levenshtein(composer.name, name), ...composer.aliases.map((alias) => levenshtein(alias,name))].sort()[0],
  composer,
})), ['distance']);

export const stats = (): IComposerStats => {
  const composers = composerFile.fetch();
  return {
    nComposers: composers.length,
  };
};
