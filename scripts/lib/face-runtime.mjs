import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'src/shared/image-face');
export function syncFaceRuntime(project, check = false) {
  const main = path.join(project, 'src/c/main.c');
  if (!existsSync(main) || !readFileSync(main, 'utf8').includes('#include "face-engine.h"')) return;
  for (const name of readdirSync(source).filter(n => /\.(h|js)$/.test(n))) {
    const target = path.join(project, name.endsWith('.h') ? 'src/c' : 'src/pkjs', name);
    const content = '// GENERATED from src/shared/image-face/' + name + '. Do not edit this copy.\n' + readFileSync(path.join(source, name), 'utf8');
    if (existsSync(target) && readFileSync(target, 'utf8') === content) continue;
    if (check) throw new Error('Runtime copy out of date: ' + target);
    writeFileSync(target, content);
  }
}
