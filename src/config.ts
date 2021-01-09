import { FileHandler } from './file-handler';

export interface IConfig {
  player: string;
}

export const getSettings = ():IConfig => {
  const settingsFile = new FileHandler<IConfig>('config.json');
  return settingsFile.fetch() ?? {
    player: 'afplay',
  };
};
