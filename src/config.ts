import { FileHandler } from './file-handler';
import { IKey } from './keypress';

const chalk = require('chalk');

export interface IThemeSettings {
  chalk?: string[];
};

export interface ITheme {
  detail?: IThemeSettings;                            // Track information detail
  error?: IThemeSettings;                             // Text of error messages
  greenBarHeader?: IThemeSettings;                    // Headings for greenbar output (use odd or even by default)
  greenBar1?: IThemeSettings;                         // Odd lines of greenBar output
  greenBar2?: IThemeSettings;                         // Even lines of greenBar output
  help?: IThemeSettings;                              // Help text
  notification?: IThemeSettings;                      // Notification of actions by app
  paused?: IThemeSettings;                            // [PAUSED] message
  progressBar?: IThemeSettings;                       // Progress bar while playing
  progressBackground?: IThemeSettings;                // The unfilled portion of the progress bar
  progressBarWithMessage?: IThemeSettings;            // Progress bar that has a message embedded
  progressBarWithMessageBackground?: IThemeSettings;  // Unfilled portion of same
  warning?: IThemeSettings;                           // Text of warnings
}

export interface IKeyAssignments {
  diagnostics?: Partial<IKey>;
  help?: Partial<IKey>;
  info?: Partial<IKey>;
  nextTrack?: Partial<IKey>;
  pause?: Partial<IKey>;
  pauseAfterTrack?: Partial<IKey>;
  previousTrack?: Partial<IKey>;
  quit?: Partial<IKey>;
  quitAfterTrack?: Partial<IKey>;
  rewind?: Partial<IKey>;
  resume?: Partial<IKey>;
  shuffle?: Partial<IKey>;
  stop?: Partial<IKey>;
}

const defaultKeyAssignments: IKeyAssignments = {
  diagnostics: { sequence: 'D' },
  help: { sequence: 'h' },
  info: { sequence: 'i' },
  nextTrack: { sequence: 'j' },
  pause: { sequence: 'p' },
  pauseAfterTrack: { sequence: 'P' },
  previousTrack: { sequence: 'k' },
  quit: { sequence: 'q' },
  quitAfterTrack: { sequence: 'Q' },
  rewind: { sequence: 'R' },
  resume: { sequence: 'r' },
  shuffle: { sequence: 'S' },
  stop: { sequence: 's' },
};

export type ThemeElement = keyof ITheme;
export type Theming = ThemeElement | IThemeSettings;

export interface IConfig {
  player: string;
  trackOverlap?: number;  // Milliseconds to shave off end of track before advancing (by default)
  layout?: string;
  theme?: ITheme;
  keyAssignments?: IKeyAssignments;
}

const defaultConfig: IConfig = {
  player: 'afplay',
  keyAssignments: defaultKeyAssignments,
};

let configFile: FileHandler<IConfig> | undefined = undefined;

export const getSettings = (): IConfig => {
  if (!configFile) {
    configFile = new FileHandler<IConfig>('config.json');
  }
  const settings = configFile.fetch();
  return settings ?
    { ...defaultConfig, ...settings } :
    defaultConfig;
};

export const getKey = (name: keyof IKeyAssignments) => getKeyAssignments()[name];

export const getKeyAssignments = (): IKeyAssignments => 
  getSettings().keyAssignments ?? defaultKeyAssignments;

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
  if (text.length < 1) {
    return text;
  }
  const chalkString = chalks.reverse().reduce(
    (accum, c) => `{${c} ${accum}}`, text.replace(/}/g, '\\}')
  );
  return eval('chalk`' + chalkString + '`');
}

export const getCacheStats = () => configFile?.stats;
