import { readdirSync } from 'node:fs';
import path from 'node:path';
import { syncFaceRuntime } from './lib/face-runtime.mjs';
const faces = path.resolve('src/faces');
for (const entry of readdirSync(faces, { withFileTypes: true })) {
  if (entry.isDirectory()) syncFaceRuntime(path.join(faces, entry.name), process.argv.includes('--check'));
}
console.log('Shared image-face runtime copies are aligned.');
