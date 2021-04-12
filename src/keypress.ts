import { getKey, IKeyAssignments } from './config';
import { notification } from './util';
import * as _ from 'lodash';

export interface IKey {
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
}

export interface IKeyMaker {
  name: keyof IKeyAssignments;
  func: (key: IKey) => any;
  help?: string;
}

export interface IKeyMapping {
  key: Partial<IKey>;           // Any element not specified is ignored when matching
  func: (key: IKey) => any;     // Return value is ignored
  help?: string;                // Short description of the function for help text
}

let keyMappings = [] as IKeyMapping[];
let initialized: boolean = false;
let active: boolean = false;
let logging: boolean = false;

const keysMatch = (k1: Partial<IKey>, k2: Partial<IKey>) =>
  k1.name === k2.name &&
  k1.ctrl === k2.ctrl &&
  k1.shift === k2.shift &&
  k1.meta === k2.meta &&
  k1.sequence === k2.sequence;

const keyMappingsMatch = (k1: IKeyMapping, k2: IKeyMapping) => 
  keysMatch(k1.key, k2.key) &&
  k1.func === k2.func;

const keyMappingApplies = (key: IKey, keyMapping: IKeyMapping) =>
  (keyMapping.key.sequence === undefined || keyMapping.key.sequence === key.sequence) &&
  (keyMapping.key.name === undefined || keyMapping.key.name === key.name) &&
  (keyMapping.key.ctrl === undefined || keyMapping.key.ctrl === key.ctrl) &&
  (keyMapping.key.meta === undefined || keyMapping.key.meta === key.meta) &&
  (keyMapping.key.shift === undefined || keyMapping.key.shift === key.shift);

const findKeyMapping = (keyMapping: IKeyMapping): IKeyMapping[] =>
  keyMappings.filter((km) => keyMappingsMatch(keyMapping, km));

export const makeKeys = (makers: IKeyMaker[]): IKeyMapping[] =>
  makers.map((maker) => ({ 
    key: getKey(maker.name), 
    ..._.pick(maker, ['func', 'help']) 
  })).filter((km) => !!km.key) as IKeyMapping[];

export const addKeys = (keys: IKeyMapping[]) =>
  keys.map((km) => addKey(km));

export const removeKeys = (keys: IKeyMapping[]) =>
  keys.map((km) => removeKey(km));

export const addKey = (keyMapping: IKeyMapping) => {
  if (findKeyMapping(keyMapping).length < 1) {
    keyMappings = [ keyMapping, ...keyMappings ];
    return true;
  }
  return false;
}

export const removeKey = (keyMapping: IKeyMapping) => {
  const old = keyMappings;
  keyMappings = keyMappings.filter((km) => !keyMappingsMatch(keyMapping, km));
  return old.length > keyMappings.length;
}

export const suspend = () => active = false;
export const resume = () => active = true;

export const fixTTY = () => {
  const readline = require('readline');
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
};

export const init = (log: boolean = false) => {
  logging = log;
  resume();
  if (initialized) {
    return;
  }
  initialized = true;
  fixTTY();
  process.stdin.on('keypress', (c: string, key: IKey) => {
    if (logging) {
      notification(c, key);
    }
    if (active) {
      keyMappings.filter((km) => keyMappingApplies(key, km))
      .map((km) => km.func(key));
    }
  })
};

const keyText = (k: Partial<IKey>): string => 
  `${k.ctrl ? '^' : ''}${k.meta ? '\u2318' : ''}${(k.shift ? k.name?.toUpperCase() : k.name) ?? k.sequence}`;

export const makeHelpText = (): string[] => {
  const byKey = 
    _.groupBy(
      keyMappings.filter((keyMapping) => !!keyMapping.help), 
      (km) => keyText(km.key)
    );
  return Object.keys(byKey)
    .sort()
    .map((k) => `${k} - ${_.uniq(byKey[k].map((km) => km.help)).join(' & ')}`);
};
