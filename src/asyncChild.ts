const execPromise = require('child-process-promise').exec;
const { spawn } = require('child_process');

export const execWithProgress = async (
  cmd: string, 
  notifyFunc: (elapsed: number) => void | Promise<void>, 
  notifyInterval: number = 1000
): Promise<string> => new Promise((resolve, reject) => {
  const start = Date.now();
  const timer = setInterval(() => {
    const elapsed = Date.now() - start;
    notifyFunc(elapsed);
  }, notifyInterval);
  execPromise(cmd)
    .then((result:any) => {
      clearInterval(timer);
      if (result.error) {
        reject(new Error(result.error));
      } else {
        resolve(result.stdout || '');
      }
    })
    .catch((error:Error) => {
      clearInterval(timer);
      reject(error);
    });
});

export const spawnWithProgress = async (
  cmd: string, 
  args: string[],
  notifyFunc: (elapsed: number) => void | Promise<void>, 
  notifyInterval: number = 1000
): Promise<void> => new Promise((resolve, reject) => {
  const start = Date.now();
  const timer = setInterval(() => {
    const elapsed = Date.now() - start;
    notifyFunc(elapsed);
  }, notifyInterval);
  const p = spawn(cmd, args, { stdio: 'ignore' });
  p.on('close', () => {
    clearInterval(timer);
    resolve();
  });
  p.on('error', (err: Error) => {
    clearInterval(timer);
    reject(err);
  });
});
