import { FileHandler } from './file-handler';

const chalk = require('chalk');

export interface IThemeSettings {
  chalk?: string[];
};

export interface ITheme {
  detail?: IThemeSettings;             // Track information detail
  error?: IThemeSettings;              // Text of error messages
  help?: IThemeSettings;               // Help text
  notification?: IThemeSettings;       // Notification of actions by app
  paused?: IThemeSettings;             // [PAUSED] message
  progressBar?: IThemeSettings;        // Progress bar while playing
  progressText?: IThemeSettings;       // Text associated with progress bar
  warning?: IThemeSettings;            // Text of warnings
}

export type ThemeElement = keyof ITheme;
export type Theming = ThemeElement | IThemeSettings;

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
  themeSettings?.chalk ? applyChalks(themeSettings.chalk, text) : text;

export const applyThemeSetting = (text: string, element?: Theming) => 
  element ?
    applyThemeSettings(
      text, 
      (typeof element === 'string') ? getTheme()[element] : element
    ) :
    text;

const applyChalks = (chalks: string[], text: string) => {
  const chalkString = chalks.reverse().reduce((accum, c) => `{${c} ${accum}}`, text);
  return eval('chalk`' + chalkString + '`');
}
