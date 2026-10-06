<<ASB: [rvw_009] Put everything except the dependency repair notes in docs/agents/sandcastle-runbook.md and add a note in AGENTS.md to refer to it.

Organize it as:

1. What is sandcastle and why we are using it (very brief - missing right now)
2. Known setup and execution sequence
3. Github-backed sandcastle issue workflow

There is duplication of information in here and what is already in AGENTS.md - deduplicate and put all in the runbook instead of AGENTS.md except what is absolutely necessary at the top level.

Do not refer to custom tracker history - right as standalone forward facing.>>

# Proposed additions to `AGENTS.md`

These are additions to review, not yet applied.

## Sandcastle GitHub tracker seam

### GitHub-backed Sandcastle issue workflow

Sandcastle must use the repository's GitHub Issues through `gh`; do not recreate a local Markdown tracker <<ASB: [rvw_001] Delete "; do not recreate a local Markdown tracker".>>.

- Install the GitHub CLI in the Sandcastle image. The current Sandcastle GitHub tracker template provides command shapes but does not install `gh` itself.
- Authenticate the sandbox with the approved read/write GitHub credential path. Prefer a short-lived `GH_TOKEN` passed through the Sandcastle environment;  <<ASB: [rvw_002] Delete "Prefer a short-lived `GH_TOKEN` passed through the Sandcastle environment; ".>>otherwise mount the host `gh` configuration read-only and verify that the container can use it without writing host state. Never print tokens.
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
<<ASB: [rvw_004] Comment on "\"Completed by Sandcastle\"": Don't hardcode the message - agent should generate?>>

- Claiming remains a separate serialized step:

```bash
gh issue edit <ID> --repo akhilsbehl/pie-subagents --add-assignee @me
```

- Preserve GitHub labels, native sub-issues, and native dependency state. The tracker seam must not treat issue numbers from different maps as globally meaningful blockers.
- Before running a planner batch, verify that the list command returns only the intended actionable frontier. If authentication, `gh`, or JSON output fails, stop; do not fall back to `.scratch/ <<ASB: [rvw_005] Delete "; do not fall back to `.scratch/".>>`.

The existing Sandcastle custom tracker setup guidance confirms that only three commands are required at the prompt seam: list, view, and close. It also confirms that the list command must emit an array containing at least an id/number, title, and body. <<ASB: [rvw_007] Comment on block "The existing Sandcastle custom tracker setup guidance confirms that only three commands are required at the prompt seam: list, view, and close. It also confirms that the list command must emit an array containing at least an id/number, title, and body.": Remove all references to the custom tracker - gh is a natively supported tracker in Sandcastle - we are confusing the documentation due to the migration path.>> <<ASB: [rvw_006] Delete "The existing Sandcastle custom tracker setup guidance confirms that only three commands are required at the prompt seam: list, view, and close. It also confirms that the list command must emit an array containing at least an id/number, title, and body.".>>

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
5. Run the infrastructure/project-local smoke test only through the checked-in runner. <<ASB: [rvw_010] Comment on "Run the infrastructure/project-local smoke test only through the checked-in runner.": Aren't we beyond smoke testing?>> The runner uses the `pi-approved` provider and a disposable writable copy of `~/.pi/agent`; do not make the host Pi directory writable.
6. Run the GitHub-backed planner only after the `gh` tracker seam has passed its list/view/close smoke test. <<ASB: [rvw_011] Comment on block "Run the GitHub-backed planner only after the `gh` tracker seam has passed its list/view/close smoke test.": Again runbook is past smoke testing - clean up>>
7. Inspect every result branch before merge. Review the branch diff, test results, Git status, and any claimed/closed GitHub issue state. Do not merge automatically. <<ASB: [rvw_012] Comment on block "Inspect every result branch before merge. Review the branch diff, test results, Git status, and any claimed/closed GitHub issue state. Do not merge automatically.": Merge will be a sandcastle step eventually with it's own prompt. I don't think we need this.>>
8. After review and merge, re-plan from GitHub. Do not run a second planner against the same frontier concurrently. <<ASB: [rvw_013] Comment on block "After review and merge, re-plan from GitHub. Do not run a second planner against the same frontier concurrently.": I don't understand what this is saying.>>
9. The parent `configs` repository receives a submodule-pin update only in a separate, explicitly requested parent commit. <<ASB: [rvw_014] Comment on block "The parent `configs` repository receives a submodule-pin update only in a separate, explicitly requested parent commit.": Sandcastle is only going to mount the cwd - the agent won't even see configs.>>

### Failure recovery

- Preserve the branch and worktree when a run fails. Inspect `git status`, `git log`, and Sandcastle output before cleanup.
- Rerun only after determining whether the issue was authentication, image/CA setup, provider startup, tracker JSON, Git worktree cleanup, or agent behaviour.
- Treat stale branches and worktrees as evidence to inspect, not as disposable by default. Confirm that no uncommitted or unmerged work exists before removal.
- If the GitHub tracker command fails, stop the planner and repair the tracker seam. Do not silently use local files or invent text-only dependency fallbacks.

## Required dependency repair before using the frontier <<ASB: [rvw_008] Comment on block "## Required dependency repair before using the frontier": Okay, do this but this should not be in this README addition.>>

The migration preserved `Blocked by` text but did not create every native GitHub dependency. The original local syntax used bold metadata (`**Blocked by:**`), which the migration parser missed.

Before selecting implementation work, run a one-time idempotent repair that:

1. Reads each migrated issue body for its local `Blocked by` values.
2. Resolves each blocker within the issue's original map, not by global issue number.
3. Creates the native `dependencies/blocked_by` edge using the blocker issue's database ID.
4. Verifies `issue_dependencies_summary` for every affected issue.
5. Reports unresolved or ambiguous blockers and stops rather than guessing.

The implementation frontier must not be trusted until this repair passes.
