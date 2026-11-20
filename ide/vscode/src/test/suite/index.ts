import { resolve } from 'node:path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: false, timeout: 60_000 });
  const here = __dirname;
  for (const file of await glob('**/*.test.js', { cwd: here })) mocha.addFile(resolve(here, file));
  return new Promise((res, rej) => {
    mocha.run((failures) => (failures > 0 ? rej(new Error(`${failures} test(s) failed`)) : res()));
  });
}
