
export interface IKey {
  name?: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  sequence: string;
}

export const init = () => {
  const readline = require('readline');
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
};

export const addKey = (
  key: string | IKey,
  f: (key: IKey) => void | Promise<void>
) => {
}
