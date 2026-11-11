---
name: modern-web-guidance
description: Look up current cross-browser guidance (Chrome, Edge, Firefox and MDN teams) before you write or change this project's own web front-end code, meaning HTML, CSS and client-side UI code such as dialogs, popovers, menus, forms and validation, layout, animation, accessibility, Core Web Vitals, CSP or passkeys. Optional, not mandatory. Not for pages you build for T3's html_preview or html_render, reports, back-end code, build config or tests. Shared by devbox projects; source in ~/projects/devbox/config/skills/modern-web-guidance.
---

# Modern Web Guidance on the devbox

About 200 short, reviewed guides on modern web platform features. Each guide has fallbacks
and Baseline browser-support data. Use it when a task in the project's real web code touches a
platform feature, especially one newer than your training. Skip it for trivial edits, for code
where you already know the right platform feature, and always for `html_preview` and
`html_render` pages made for Tom.

## Use

From the project root:

```sh
.agents/skills/modern-web-guidance/scripts/mwg search "light dismiss dialog"
.agents/skills/modern-web-guidance/scripts/mwg retrieve light-dismiss-a-dialog,html
```

- **Query:** 2–5 words for one capability. Name the UI primitive or platform feature
  ("confirm dialog", "date picker input", "responsive data table"). Leave out framework,
  product, file and app names. Split a compound task into separate searches.
- `search` returns JSON (`id`, `description`). `retrieve` the ids that match, comma-separated,
  plus the broad guide for the discipline when it applies (`html`, `css`, `forms`,
  `accessibility`, `performance`, `security`). If nothing matches, rephrase once with the
  component noun. If still nothing, go on without it.
- Output over 9.5 KB is saved to a temp file. Read that file with your file-reading tool.
- Check your code against the guide: its modern pattern, and the fallbacks the project's
  Baseline needs. In your summary, add one line per guide that shaped the change.

## Baseline and frameworks

- The project's `AGENTS.md` states its Baseline target. If it doesn't, assume **Baseline
  Widely available**: features newer than that keep the guide's fallbacks. Don't create
  `.mwgrc` files.
- The guides use plain HTML, CSS and JS. Adapt them without dropping the feature: in React,
  call `showModal()` through refs, generate ids and `anchor-name`s with `useId()`, cast
  new HTML attributes that the types don't know yet, and guard `window` in SSR.

## Whole-codebase modernisation

Only when asked to audit or modernise a whole codebase:
`mwg legacy-scan src --json`. Check each finding against its `keepWhen`/`dropWhen`, drop the
false positives, and report. It covers only about 20% of the guides. Where its output
suggests `npx modern-web-guidance retrieve <id>`, run `mwg retrieve <id>` instead.

## Rules

- `scripts/mwg` runs one pinned, hash-checked copy of the CLI with telemetry off, inside
  Node's permission sandbox (no network, no child processes). Never run
  `npx modern-web-guidance`, and never install the upstream skill or plugin.
- If `mwg` reports that the CLI is missing and can't download it, run `mwg fetch` with
  network approval, or ask Q.
- Changes to this skill go to the devbox Q thread. Q keeps the one source in
  `~/projects/devbox/config/skills/modern-web-guidance` and reinstalls the project copies
  (`npx skills add ~/projects/devbox/config/skills/modern-web-guidance -a claude-code -a codex -y`).
  Don't edit a project's copy.
