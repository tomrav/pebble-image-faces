import { syncFaceRuntime } from './lib/face-runtime.mjs';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = process.cwd();
const kinds = [
  { label: 'app', root: path.join(repoRoot, 'src', 'apps') },
  { label: 'face', root: path.join(repoRoot, 'src', 'faces') },
];

function listProjects() {
  const projects = [];

  for (const kind of kinds) {
    if (!existsSync(kind.root)) {
      continue;
    }

    for (const entry of readdirSync(kind.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }

      projects.push({
        kind: kind.label,
        name: entry.name,
        dir: path.join(kind.root, entry.name),
      });
    }
  }

  return projects.sort((left, right) => left.name.localeCompare(right.name));
}

function readProjectManifest(project) {
  const manifestPath = path.join(project.dir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  return manifest;
}

function isWatchfaceProject(project) {
  const manifest = readProjectManifest(project);

  return Boolean(manifest.pebble?.watchapp?.watchface);
}

function usage(exitCode = 0) {
  const projects = listProjects();
  const names = projects.length
    ? projects.map((project) => `- ${project.kind}: ${project.name}`).join('\n')
    : '(no projects found)';

  console.log(`Usage:
  npm run pebble:list
  npm run pebble:build -- <project-name>
  npm run pebble:emulator -- <project-name>
  npm run pebble:cloud -- <project-name>
  npm run pebble:logs -- <project-name>
  npm run pebble:screenshot -- <project-name>
  npm run pebble:test -- <project-name>
  npm run pebble:test:all

Available projects:
${names}`);

  process.exit(exitCode);
}

function resolveProject(name) {
  const matches = listProjects().filter((project) => project.name === name);

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    console.error(`Project name '${name}' is ambiguous. Use unique names across src/apps and src/faces.`);
    process.exit(1);
  }

  console.error(`Project '${name}' was not found.`);
  usage(1);
}

// Resolve which Pebble connection to target from trailing CLI flags.
// Defaults to the Emery emulator; `--device`/`--cloudpebble` use the
// CloudPebble proxy, and `--phone <IP>` uses the phone developer connection.
function connectionArgs(extraArgs) {
  const phoneIndex = extraArgs.indexOf('--phone');
  if (phoneIndex !== -1) {
    const ip = extraArgs[phoneIndex + 1];
    if (!ip) {
      console.error('--phone requires an IP address, e.g. --phone 192.168.1.50');
      process.exit(1);
    }
    return ['--phone', ip];
  }

  if (extraArgs.includes('--device') || extraArgs.includes('--cloudpebble')) {
    return ['--cloudpebble'];
  }

  return ['--emulator', 'emery'];
}

// The SDK bundles pebble-js-app.js.map into the .pbw, and its sourcesContent
// carries the absolute path of the SDK's own _pkjs_shared_additions.js — i.e. the
// build machine's home directory, and so the local username. A .pbw is just a zip
// that anyone can open, and the map has no runtime use on the watch or the phone,
// so drop it after every build rather than publish that path.
function stripSourceMaps(project) {
  const buildDir = path.join(project.dir, 'build');
  if (!existsSync(buildDir)) return;

  for (const pbw of readdirSync(buildDir).filter((f) => f.endsWith('.pbw'))) {
    const result = spawnSync('zip', ['-q', '-d', path.join(buildDir, pbw), '*.map'], {
      stdio: 'inherit',
    });
    // 12 is zip's "nothing to do" — a C-only project with no JS bundle.
    if (result.error || (result.status && result.status !== 12)) {
      console.error(`Warning: could not strip source maps from ${pbw}`);
    }
  }
}

function runPebble(project, args, onSuccess) {
  syncFaceRuntime(project.dir);
  const result = spawnSync('pebble', args, {
    cwd: project.dir,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status === 0 && onSuccess) {
    onSuccess();
  }

  process.exit(result.status ?? 1);
}

function runPebbleCommand(project, args) {
  syncFaceRuntime(project.dir);
  const result = spawnSync('pebble', args, {
    cwd: project.dir,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const argString = args.join(' ');
    throw new Error(`pebble ${argString} failed for ${project.name}`);
  }
}

function screenshotPathFor(project) {
  return path.join(repoRoot, 'artifacts', 'screenshots', `${project.name}.png`);
}

function ensureArtifactsDir() {
  mkdirSync(path.join(repoRoot, 'artifacts', 'screenshots'), { recursive: true });
}

// `pebble screenshot` exits 0 even when it dies with libpebble2 TimeoutError and
// writes nothing at all. A caller chaining `npm run pebble:screenshot && cp ...`
// then copies the PREVIOUS capture and believes it is current — a stale image
// that silently misrepresents the build under test. That trap has already cost
// us one wrong screenshot, so trust the output file, never the exit code.
//
// Capturing to a temp path and only promoting it on success means the failure is
// loud and the destination is never half-written.
function captureScreenshot(project) {
  ensureArtifactsDir();

  const target = screenshotPathFor(project);
  const temp = `${target}.capturing`;
  rmSync(temp, { force: true });

  // Output is captured rather than inherited so the tool's own "Saved screenshot
  // to <temp>" chatter does not contradict the real destination printed below.
  // It is surfaced in full when something goes wrong.
  const result = spawnSync(
    'pebble',
    ['screenshot', '--emulator', 'emery', '--no-open', temp],
    { cwd: project.dir, encoding: 'utf8' },
  );

  const fail = (reason) => {
    rmSync(temp, { force: true });
    const output = [result.stdout, result.stderr].filter(Boolean).join('').trim();
    const stale = existsSync(target)
      ? `\n  NOTE: ${path.relative(repoRoot, target)} still holds an EARLIER capture. It is now stale — do not use it.`
      : '';
    const detail = output ? `\n--- pebble output ---\n${output}\n---------------------` : '';
    throw new Error(`Screenshot capture failed for ${project.name}: ${reason}${stale}${detail}`);
  };

  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`pebble screenshot exited ${result.status}`);
  if (!existsSync(temp)) fail('pebble screenshot wrote no file (emulator timeout?)');

  // A truncated or empty file is as misleading as a missing one; require a real
  // PNG header before letting it stand in for the previous capture.
  const size = statSync(temp).size;
  if (size === 0) fail('capture is empty');
  const header = readFileSync(temp).subarray(0, 8);
  if (!header.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    fail(`capture is not a PNG (${size} bytes)`);
  }

  renameSync(temp, target);
  return target;
}

function printTestSummary(project) {
  const watchface = isWatchfaceProject(project);

  console.log('');
  console.log(`Test summary for ${project.name}:`);
  console.log('- Build succeeded');
  console.log('- Emulator install succeeded');

  if (watchface) {
    console.log(`- Screenshot captured at ${path.relative(repoRoot, screenshotPathFor(project))}`);
  } else {
    console.log('- App smoke install completed; use emulator UI plus logs for runtime verification');
  }

  console.log('- Next local checks: runtime logs and manual device smoke if hardware or phone comms are involved');
}

function testProject(project) {
  const watchface = isWatchfaceProject(project);

  runPebbleCommand(project, ['build']);
  stripSourceMaps(project);
  runPebbleCommand(project, ['install', '--emulator', 'emery']);

  if (watchface) {
    captureScreenshot(project);
  }

  printTestSummary(project);
}

function testAllProjects() {
  const projects = listProjects();

  if (!projects.length) {
    console.error('No projects found.');
    process.exit(1);
  }

  for (const project of projects) {
    console.log(`\n=== Testing ${project.kind}: ${project.name} ===`);
    testProject(project);
  }
}

const [action, projectName] = process.argv.slice(2);
const extraArgs = process.argv.slice(4);

if (!action || action === 'help' || action === '--help' || action === '-h') {
  usage(0);
}

if (action === 'list') {
  usage(0);
}

if (action === 'test-all') {
  try {
    testAllProjects();
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (!projectName) {
  console.error('A project name is required.');
  usage(1);
}

const project = resolveProject(projectName);

switch (action) {
  case 'build':
    runPebble(project, ['build'], () => stripSourceMaps(project));
    break;
  case 'emulator':
    runPebble(project, ['install', '--emulator', 'emery']);
    break;
  case 'cloud':
    runPebble(project, ['install', '--cloudpebble']);
    break;
  case 'logs':
    runPebble(project, ['logs', ...connectionArgs(extraArgs)]);
    break;
  case 'screenshot':
    try {
      console.log(`Saved screenshot to ${captureScreenshot(project)}`);
      process.exit(0);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
    break;
  case 'test':
    try {
      testProject(project);
      process.exit(0);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
    break;
  default:
    console.error(`Unknown action '${action}'.`);
    usage(1);
}
