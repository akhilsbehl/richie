# Sandcastle configuration boundary

The smoke-test decision is recorded. The next decision is where the reusable Sandcastle configuration should live.

❓ **Q1 — Configuration location**: Where should `.sandcastle/` and the orchestration entry points live?

1. In the current `pi/extensions/subagents` directory.
2. At the parent pi-subagents repository root.
3. In a separate harness repository that targets this project by path.

➡️ Recommended: 1. Sandcastle anchors `.sandcastle/`, git operations, worktrees, and logs to the target repository. Keeping the setup beside the extension avoids hidden cross-repository coupling and follows the current working-directory restriction. <<ASB: [rvw_001] Comment on block "➡️ Recommended: 1. Sandcastle anchors `.sandcastle/`, git operations, worktrees, and logs to the target repository. Keeping the setup beside the extension avoids hidden cross-repository coupling and follows the current working-directory restriction.": Yes>>

❓ **Q2 — Initial configuration shape**: What should we commit as the reusable baseline?

1. A minimal smoke-test runner only; add the issue workflow later.
2. A smoke-test runner plus a generic runner seam for local-markdown tickets.
3. A complete issue-driven workflow immediately.

➡️ Recommended: 2. Commit the stable runtime boundary first, but leave the local-ticket adapter explicit and small. Do not pretend Sandcastle's GitHub-oriented templates support `.scratch/` automatically. <<ASB: [rvw_002] Comment on block "➡️ Recommended: 2. Commit the stable runtime boundary first, but leave the local-ticket adapter explicit and small. Do not pretend Sandcastle's GitHub-oriented templates support `.scratch/` automatically.": Yes>>

❓ **Q3 — Secret handling**: What should be committed?

1. `.env.example` and `.gitignore` rules only; keep `.env` and any credential mounts local.
2. A checked-in path to the host Pi directory.
3. Credentials or a copied Pi configuration in the repository.

➡️ Recommended: 1. The repository should contain instructions and defaults, never credentials or machine-specific paths. <<ASB: [rvw_003] Comment on block "➡️ Recommended: 1. The repository should contain instructions and defaults, never credentials or machine-specific paths.": I don't understand this. What secrets do I even need?>>

Reply with `Q1=...; Q2=...; Q3=...`. The Codex-subscription authentication research is running separately.