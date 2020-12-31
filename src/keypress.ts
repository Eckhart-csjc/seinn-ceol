
export interface IKey {
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
}

export interface IKeyMapping {
  key: Partial<IKey>;           // Any element not specified is ignored when matching
  func: (key: IKey) => any;     // Return value is ignored
}

let keyMappings = [] as IKeyMapping[];
let active: boolean = false;

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

export const addKey = (keyMapping: IKeyMapping) => {
  if (findKeyMapping(keyMapping).length < 1) {
    keyMappings = [ keyMapping, ...keyMappings ];
  }       // Silently fails if mapping already exists
}

export const removeKey = (keyMapping: IKeyMapping) => {
  keyMappings = keyMappings.filter((km) => !keyMappingsMatch(keyMapping, km));
}

export const suspend = () => active = false;
export const resume = () => active = true;

export const init = () => {
  const readline = require('readline');
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.on('keypress', (c: string, key: IKey) => {
    if (active) {
      keyMappings.filter((km) => keyMappingApplies(key, km))
      .map((km) => km.func(key));
    }
  })
  resume();
};
