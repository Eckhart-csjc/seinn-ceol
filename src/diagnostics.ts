import { error } from './util';

export interface ICacheStats {
  stores: number;
  hits: number;
  misses: number;
}

export interface ITiming {
  start: number;
  end?: number;
}

export interface ITimingId {
  name: string;
  index: number;
}

const timings: Record<string, ITiming[]> = {};

export const startTiming = (name: string): ITimingId => {
  const existing = timings[name];
  const timing = { start: Date.now() };

  if (existing) {
    existing.push(timing);
    return { name, index: existing.length - 1 };
  }

  timings[name] = [ timing ];
  return { name, index: 0 };
}

export const endTiming = (id: ITimingId): ITiming | undefined => {
  const now = Date.now();
  const timing = timings[id.name]?.[id.index];
  if (!timing) {
    error(`endTiming called for an id that was not found: ${JSON.stringify(id)}`);
    return undefined;
  }
  timing.end = now;
  return timing;
}

export const getTimings = () => timings;