import * as _ from 'lodash';
import { ArrayFileHandler } from './array-file-handler';
import { play } from './play';
import * as track from './track';

export interface IPlayList {
  name: string;           // Play list name
  orderBy: string[];      // ITrackSort keys for order of play
  lastPlayed?: string;    // trackPath of track ast played (undefined to start from the top)
}

const playListFile = new ArrayFileHandler<IPlayList>('playlists.json');

export const fetchAll = () => playListFile.fetch();

export const find = (name: string, playlists?: IPlayList[]) => _.find(playlists ?? fetchAll(), (pl) => pl.name === name);
export const save = (playlist: IPlayList) => {
  const playlists = fetchAll();
  const existing = find(playlist.name, playlists);
  if (existing) {
    _.merge(existing, playlist);
    playListFile.save(playlists);
  } else {
    playListFile.save([ ...playlists, playlist ]);
  }
};

export const playList = async (name: string): Promise<void> => {
  const playlist = find(name);
  if (!playlist) {
    console.error(`Could not find playlist "${name}"`);
    return;
  }
  const sorted = track.sort(playlist.orderBy);
  const lastIndex = playlist.lastPlayed ? _.findIndex(sorted, (track) => track.trackPath === playlist.lastPlayed) : -1;
  const nextIndex = (lastIndex >= sorted.length - 1) ? 0 : lastIndex + 1; 
  const next = sorted[nextIndex];
  const trackPath = next.trackPath;
  await play(trackPath);
  save({ ...playlist, lastPlayed: trackPath });
  return playList(name);
};

