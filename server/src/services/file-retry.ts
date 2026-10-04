const pause = new Int32Array(new SharedArrayBuffer(4));
const delays = [20, 40, 80, 160, 320, 320];
const locked = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** Windows scanners/sync clients briefly deny access to otherwise valid files. */
export function retryFileOperation<T>(operation: () => T): T {
  for (let attempt = 0; ; attempt++) {
    try { return operation(); }
    catch (error) {
      if (process.platform !== 'win32' || !locked.has((error as NodeJS.ErrnoException).code || '') || attempt >= delays.length) throw error;
      Atomics.wait(pause, 0, 0, delays[attempt]);
    }
  }
}
