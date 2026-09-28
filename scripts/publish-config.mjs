// Publishes docs/ (the settings pages, plus the watch-ready images the phone
// streams) to Cloudflare Pages via wrangler direct upload.
//
// Direct upload means no repo is involved: nothing about this workspace, its
// history or its author is exposed by the hosted site. Auth comes from the
// wrangler OAuth login already stored in ~/Library/Preferences/.wrangler/
// (run `npx wrangler login` if it has expired), or from CLOUDFLARE_API_TOKEN.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Pages project name. Direct upload REPLACES the whole site, so point this at a
// project that serves only this repo's docs/.
const PROJECT = process.env.PAGES_PROJECT || 'image-faces-config';
const BRANCH = 'main'; // Pages treats this as the production branch.

const root = process.cwd();
const dir = path.join(root, 'docs');

if (!existsSync(path.join(dir, 'index.html'))) {
  console.error(`No docs/index.html under ${root} — run from the repo root.`);
  process.exit(1);
}

const wrangler = (args) =>
  execFileSync('npx', ['--yes', 'wrangler', ...args], {
    stdio: 'inherit',
    env: process.env,
  });

// `pages deploy` creates the project on first run, but only when it can prompt.
// Create it up front so the script also works non-interactively.
let projects;
try {
  projects = execFileSync('npx', ['--yes', 'wrangler', 'pages', 'project', 'list'], {
    encoding: 'utf8',
    env: process.env,
  });
} catch {
  console.error('Could not list Cloudflare Pages projects. Try `npx wrangler login`.');
  process.exit(1);
}

if (!projects.includes(PROJECT)) {
  wrangler(['pages', 'project', 'create', PROJECT, '--production-branch', BRANCH]);
}

// The faces open their settings pages from the host compiled into each .pbw
// (BASE in src/pkjs/index.js). Deploying somewhere else only serves that
// host's visitors; installed watches keep using the compiled one.
const compiledHosts = new Set();
for (const face of ['src/faces/photo-face/src/pkjs/index.js', 'src/shared/franchise-face/pkjs.tmpl.js']) {
  const m = /var BASE = 'https:\/\/([^/']+)\//.exec(readFileSync(path.join(root, face), 'utf8'));
  if (m) compiledHosts.add(m[1]);
}
const target = `${PROJECT}.pages.dev`;
if (!compiledHosts.has(target)) {
  console.warn(`\nWARNING: deploying to ${target}, but the faces are compiled to load from ${[...compiledHosts].join(', ')}.`);
  console.warn('Installed watches will not see this deployment until BASE is changed and the faces are released again.\n');
}

wrangler(['pages', 'deploy', dir, '--project-name', PROJECT, '--branch', BRANCH]);

console.log(`\nPublished docs/ -> https://${PROJECT}.pages.dev/`);
