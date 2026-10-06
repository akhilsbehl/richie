# Proposed additions to `AGENTS.md`

These are additions to review, not yet applied.

## Sandcastle GitHub tracker seam

### GitHub-backed Sandcastle issue workflow

Sandcastle must use the repository's GitHub Issues through `gh`; do not recreate a local Markdown tracker.

- Install the GitHub CLI in the Sandcastle image. The current Sandcastle GitHub tracker template provides command shapes but does not install `gh` itself.
- Authenticate the sandbox with the approved read/write GitHub credential path. Prefer a short-lived `GH_TOKEN` passed through the Sandcastle environment; otherwise mount the host `gh` configuration read-only and verify that the container can use it without writing host state. Never print tokens.
- The project repository is `akhilsbehl/pie-subagents`.
- The planner's list command should return JSON in Sandcastle's expected shape and select actionable tickets, not map issues or closed historical records:

```bash
gh issue list \
  --repo akhilsbehl/pie-subagents \
  --state open \
  --label ready-for-agent \
  --limit 100 \
  --json number,title,body,labels,comments \
  --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'
```

- The view command should return one issue with its body, labels, assignees, and comments:

```bash
gh issue view <ID> \
  --repo akhilsbehl/pie-subagents \
  --comments \
  --json number,title,body,labels,assignees,comments
```

- The close command must add a completion comment and close the issue:

```bash
gh issue close <ID> \
  --repo akhilsbehl/pie-subagents \
  --comment "Completed by Sandcastle"
```

- Claiming remains a separate serialized step:

```bash
gh issue edit <ID> --repo akhilsbehl/pie-subagents --add-assignee @me
```

- Preserve GitHub labels, native sub-issues, and native dependency state. The tracker seam must not treat issue numbers from different maps as globally meaningful blockers.
- Before running a planner batch, verify that the list command returns only the intended actionable frontier. If authentication, `gh`, or JSON output fails, stop; do not fall back to `.scratch/`.

The existing Sandcastle custom tracker setup guidance confirms that only three commands are required at the prompt seam: list, view, and close. It also confirms that the list command must emit an array containing at least an id/number, title, and body.

## Sandcastle operational runbook

### Known setup and execution sequence

1. Work on a named child branch in `pie-subagents`; do not update the parent `configs` submodule pin during development.
2. Install bootstrap dependencies:

```bash
npm install --prefix .sandcastle/bootstrap --no-fund --no-audit
```

3. Build the image with the corporate CA mounted into the build. Do not disable TLS verification:

```bash
podman build \
  --volume /etc/ssl/certs/ca-certificates.crt:/tmp/host-ca:ro \
  -f .sandcastle/Containerfile \
  -t sandcastle:pi-subagents-smoke \
  .sandcastle
```

4. Verify container-side npm TLS before an agent run if the image or CA path changed.
5. Run the infrastructure/project-local smoke test only through the checked-in runner. The runner uses the `pi-approved` provider and a disposable writable copy of `~/.pi/agent`; do not make the host Pi directory writable.
6. Run the GitHub-backed planner only after the `gh` tracker seam has passed its list/view/close smoke test.
7. Inspect every result branch before merge. Review the branch diff, test results, Git status, and any claimed/closed GitHub issue state. Do not merge automatically.
8. After review and merge, re-plan from GitHub. Do not run a second planner against the same frontier concurrently.
9. The parent `configs` repository receives a submodule-pin update only in a separate, explicitly requested parent commit.

### Failure recovery

- Preserve the branch and worktree when a run fails. Inspect `git status`, `git log`, and Sandcastle output before cleanup.
- Rerun only after determining whether the issue was authentication, image/CA setup, provider startup, tracker JSON, Git worktree cleanup, or agent behaviour.
- Treat stale branches and worktrees as evidence to inspect, not as disposable by default. Confirm that no uncommitted or unmerged work exists before removal.
- If the GitHub tracker command fails, stop the planner and repair the tracker seam. Do not silently use local files or invent text-only dependency fallbacks.

## Required dependency repair before using the frontier

The migration preserved `Blocked by` text but did not create every native GitHub dependency. The original local syntax used bold metadata (`**Blocked by:**`), which the migration parser missed.

Before selecting implementation work, run a one-time idempotent repair that:

1. Reads each migrated issue body for its local `Blocked by` values.
2. Resolves each blocker within the issue's original map, not by global issue number.
3. Creates the native `dependencies/blocked_by` edge using the blocker issue's database ID.
4. Verifies `issue_dependencies_summary` for every affected issue.
5. Reports unresolved or ambiguous blockers and stops rather than guessing.

The implementation frontier must not be trusted until this repair passes.
