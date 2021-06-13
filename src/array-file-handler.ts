import { FileHandler } from './file-handler';

export class ArrayFileHandler<T> {

  fileHandler: FileHandler<T[]>;

  constructor(baseFilename: string, pathOverride?: string) {
    this.fileHandler = new FileHandler<T[]>(baseFilename, pathOverride);
  }

  public fetch(): T[] {
    return this.fileHandler.fetch() || [] as T[];
  }

  public save(data: T[]) {
    this.fileHandler.save(data);
  }

  public getCacheStats = () => this.fileHandler.stats;
}
