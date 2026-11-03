# EagleBABA Astro Levels — Agent Instructions

## Repository

- **GitHub**: eaglebaba13/eagle13
- **Canonical workspace**: `E:\GitHub\EagleBABA-Astro-Dashboard`
- **Primary branch**: `production-release-v2` (secondary branches live under `.worktrees/`)
- **Deployment**: Hostinger KVM 4 VPS (Node.js)
- **Canonical Production Server**: `root@200.234.35.116`

## Key Rules

1. Never force-push or rewrite published history.
2. Protected formula files must remain byte-for-byte unchanged.
3. Broker execution must remain disabled.
4. Never expose secrets in client code.
5. Run `npm test` and `npm run build` before committing.
6. Canonical production VPS is strictly `root@200.234.35.116`. Use only the canonical production VPS configured in project infrastructure settings.

## Project-folder policy

- Use this folder as the only primary EagleBABA Astro Research Platform workspace.
- Keep registered secondary branches as Git-managed worktrees under `.worktrees/`; never move one with a file manager or ordinary folder move.
- Store relocation and recovery reports under `docs/`; keep preflight manifests and recovery patches in `backups/` or `recovery/`, and verified project backups in `backups/`.
- Keep historical research and release candidates isolated in their own branches/worktrees or archives. Do not copy their application source into the active `src/` tree without explicit approval.
- Do not bring unrelated projects into this repository.
- Preserve existing dirty changes, branch refs, reflogs, credentials, and backup snapshots during any organization work.
- Do not commit, push, merge to production, or deploy unless explicitly authorized.
