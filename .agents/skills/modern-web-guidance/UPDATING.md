# Updating the pinned Modern Web Guidance CLI (Q)

`scripts/mwg` pins one version of the npm package `modern-web-guidance` (`VERSION`) and its
npm integrity hash (`INTEGRITY`). On first use it downloads the tarball from the npm
registry, refuses it unless the SHA-512 matches, and unpacks it to
`~/.local/share/devbox/modern-web-guidance/<version>/`. Every call runs that copy with
`DISABLE_TELEMETRY=1` under `node --permission`. It gets no `--allow-net` and no
`--allow-child-process`, can read only the CLI, the current directory and `$TMPDIR`, and can
write only to `$TMPDIR`. Only `search`, `retrieve`, `list` and `legacy-scan` are passed
through.

The daily health check prints the pinned and latest versions and flags a newer one. Bumps
aren't urgent: the guides change, but the pinned set stays usable.

## Bump

1. `npm view modern-web-guidance@<new> version dist.integrity`.
2. Download the tarball into a new empty directory under `/tmp` and review it without running
   it. Compare it with the pinned version:
   - `package.json`: still no `scripts`, `dependencies` or install hooks.
   - `skills/modern-web-guidance/modern-web.mjs`: telemetry still checks
     `DISABLE_TELEMETRY` before it creates the sender (`isTelemetryEnabled`,
     `ClearcutLogger`). The commands we pass through still don't spawn processes or use the
     network.
   - `watchdog/main.js`: the only `fetch`, to `play.googleapis.com/log`.
   - `search.mjs`, `legacy-scan.mjs`: no new `fetch`, `http`, `net` or `child_process` use
     (legacy-scan's `git ls-files` is expected; the sandbox refuses it and the CLI falls
     back).
   - The upstream `SKILL.md`: changes to the workflow, query style or commands worth carrying
     into ours.
   If anything new phones home or runs code at install, stop and tell Tom.
3. Set `VERSION` and `INTEGRITY` in `scripts/mwg`, then run `scripts/mwg check` from the
   devbox checkout. It downloads and verifies the new copy and runs two sandboxed searches:
   telemetry off must pass, and a telemetry-on control must be refused when it tries to start
   the sender. Run one real search and retrieve from a project checkout.
4. Reinstall in each project that uses it:
   `npx skills add ~/projects/devbox/config/skills/modern-web-guidance -a claude-code -a codex -y`,
   then commit that project's skill files by named paths.
5. Remove the old version's directory, checking the exact path first:
   `~/.local/share/devbox/modern-web-guidance/<old version>`.
6. Add a change-log entry to `docs/host-baseline.md`.

Rollback: restore the previous `VERSION` and `INTEGRITY` (the old copy downloads again if
it was removed) and reinstall the project copies.
