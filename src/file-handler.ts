import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ICacheStats } from './stats';
import { error } from './util';

export class FileHandler<T> {

  public stats: ICacheStats;
  filename: string;
  cache: T | undefined;
  mtime: number;

  constructor (public baseFilename: string, public pathOverride?: string) {
    this.filename = this.makeFilename(this.baseFilename, this.pathOverride);
    this.cache = undefined;
    this.mtime = 0;
    this.stats = {
      stores: 0,
      hits: 0,
      misses: 0,
    };
  }

  public fetch(): T | undefined {
    if (fs.existsSync(this.filename)) {
      const stat = fs.statSync(this.filename);
      if (this.mtime < stat.mtimeMs) {
        this.stats.misses++;
        try {
          this.cache = JSON.parse(fs.readFileSync(this.filename, { encoding: 'utf8' }).normalize()) as T;
          this.mtime = stat.mtimeMs;
          this.stats.stores++;
        } catch (e) {
          error(`Error reading and parsing file ${this.filename}: ${e.message}`);
          process.exit(1);
        }
      } else {
        this.stats.hits++;
      }
      return this.cache;
    }
    return undefined;
  }

  public save(data: T) {
    const tmpFilename = `${this.filename}.tmp`;
    if (fs.existsSync(tmpFilename)) {
      fs.rmSync(tmpFilename);
    }
    fs.appendFileSync(tmpFilename, JSON.stringify(data, undefined, 2), { encoding: 'utf8' });
    fs.renameSync(tmpFilename, this.filename);
    const stat = fs.statSync(this.filename);
    this.mtime = stat.mtimeMs;    // Pick up our change, without forcing reload
    this.cache = data;
    this.stats.stores++;
  };

  private getDefaultPath() {
    const folderPath = path.resolve(os.homedir(), './.seinn-ceol');
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true, mode: 0o744 });
    }
    return folderPath;
  }

  private makeFilename(basename: string, pathOverride?: string) {
    return path.resolve(path.join(pathOverride ?? this.getDefaultPath(), basename));
  }
}
