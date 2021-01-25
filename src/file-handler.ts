import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { error } from './util';

export class FileHandler<T> {

  constructor (public baseFilename: string, public pathOverride?: string) {
  }

  public fetch(): T | undefined {
    const filename = this.makeFilename(this.baseFilename, this.pathOverride);
    if (fs.existsSync(filename)) {
      try {
        return JSON.parse(fs.readFileSync(filename, { encoding: 'utf8' }).normalize()) as T;
      } catch (e) {
        error(`Error reading and parsing file ${filename}: ${e.message}`);
        process.exit(1);
      }
    }
    return undefined;
  }

  public save(data: T) {
    const filename = this.makeFilename(this.baseFilename, this.pathOverride);
    const tmpFilename = `${filename}.tmp`;
    if (fs.existsSync(tmpFilename)) {
      fs.rmSync(tmpFilename);
    }
    fs.appendFileSync(tmpFilename, JSON.stringify(data, undefined, 2), { encoding: 'utf8' });
    fs.renameSync(tmpFilename, filename);
  };

  private getDefaultPath() {
    const folderPath = path.resolve(os.homedir(), './Music/seinn-ceol');
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true, mode: 0o744 });
    }
    return folderPath;
  }

  private makeFilename(basename: string, pathOverride?: string) {
    return path.resolve(path.join(pathOverride ?? this.getDefaultPath(), basename));
  }
}
