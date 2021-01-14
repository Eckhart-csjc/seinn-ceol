import { FileHandler } from './file-handler';

const chalk = require('chalk');

export interface IThemeSettings {
  chalk: string[];
};

export interface ITheme {
  help?: IThemeSettings;               // Help text
  notification?: IThemeSettings;       // Notification of actions by app
  paused?: IThemeSettings;             // [PAUSED] message
  progressBar?: IThemeSettings;        // Progress bar while playing
}

export type ThemeElement = keyof ITheme;

export interface IConfig {
  player: string;
  theme?: ITheme;
}

export const getSettings = ():IConfig => {
  const settingsFile = new FileHandler<IConfig>('config.json');
  return settingsFile.fetch() ?? {
    player: 'afplay',
  };
};

export const getTheme = () => 
  getSettings().theme || {} as Record<string, IThemeSettings>;

export const applyThemeSettings = (text: string, themeSettings?: IThemeSettings) => 
  themeSettings ? applyChalks(themeSettings.chalk, text) : text;

export const applyThemeSetting = (text: string, element: ThemeElement) => 
  applyThemeSettings(text, getTheme()[element]);

const applyChalks = (chalks: string[], text: string) => {
  const chalkString = chalks.reverse().reduce((accum, c) => `{${c} ${accum}}`, text);
  return eval('chalk`' + chalkString + '`');
}
