export class SegOut {
  
  lastCol: number;

  constructor() {
    this.lastCol = 0;
  }

  public add(text: string, sep?: string, prefix?: string) {
    if (this.lastCol > 0 && 
      (this.lastCol + text.length + (sep?.length || 0) > process.stdout.columns)) {
      this.nl();
    }
    if (this.lastCol > 0) {
      if (sep) {
        process.stdout.write(sep);
        this.lastCol += sep.length;
      }
    } else if (prefix) {
      process.stdout.write(prefix);
      this.lastCol += prefix.length;
    }
    process.stdout.write(text);
    this.lastCol += text.length;
  }

  public nl() {
    console.log('');      // New line
    this.lastCol = 0;
  }

}
