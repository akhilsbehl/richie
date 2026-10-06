# Pi usage views — grilling round 5

## Decisions captured

- Derived task turn: user-message interval including all work until the next user message.
- Unassigned work: user selected nearest task turn rather than a separate unassigned bucket.
- Visualise all approved base measures and ratios; use **per-million-token** cost bases.
- Zero denominators: `N/A`, excluded from that aggregate, with a data-quality flag.
- Zero-cost records: exclude them from cost averages.
- Scan all native session files under `~/.pi/agent/sessions/`.
- Drop session-duration metrics.

❓ **Q31** - **What does “nearest task turn” mean operationally?**

For usage with no clear user-message interval, such as a compaction between prompts:

- **A — Previous user task:** assign it backwards to the most recent preceding user message.
- **B — Next user task:** assign it forwards to the next user message.
- **C — Nearest by timestamp:** assign to whichever adjacent user message is closest; use a deterministic tie-break.
- **D — Nearest where possible; otherwise `unassigned`.**

➡️ **Recommendation:** Use **C**, with ties assigned backwards. Keep an `assignment_method` field (`interval`, `nearest`, `unassigned`) so derived averages remain auditable.

❓ **Q32** - **What should zero-cost calls contribute to?**

You chose to exclude them from cost averages. Should they still contribute to:

- session and call counts;
- token totals and token averages;
- token-based ratios;
- cost totals;
- all except cost averages.

➡️ **Recommendation:** Include zero-cost calls in **counts, token totals, token averages, and token ratios**. Exclude them only from **cost averages and cost-per-token metrics**, unless you explicitly want free/test activity to produce `$0.00 per token`.

❓ **Q33** - **What should be the SQLite fact grain?**

Proposed tables:

- `sessions`: one row per native Pi session file;
- `entries`: one row per session entry, with `entry_type`, IDs, timestamps, and source reference;
- `usage_events`: one row per usage-bearing call, linked to `entries`, with category, model, thinking level, tokens, and costs;
- `task_turns`: derived user-message intervals and their assignment metadata;
- `parser_state`: file fingerprints, last offset, and scan timestamps.

➡️ **Recommendation:** Use this structure. Keep `entries` separate from `usage_events`; one entry can contain one usage object today, but this seam protects the schema from future nested usage or extension records.

❓ **Q34** - **Where should derived aggregates live?**

Options:

- calculate everything in marimo/Python on every page load;
- store only facts and calculate SQL queries in marimo;
- create SQLite views for standard aggregates, with marimo querying them;
- persist daily/monthly summary tables as well.

➡️ **Recommendation:** Store raw analytical facts and create **SQLite views for standard aggregates**. Let marimo query those views. Add persisted summary tables only if performance requires them; premature summaries create invalidation problems.

❓ **Q35** - **What analytical source references are sufficient?**

For each stored entry or usage event, should SQLite retain:

- session file path;
- session ID and entry ID;
- parent ID;
- source line number;
- source file fingerprint/version;
- record hash;
- all of these.

➡️ **Recommendation:** Retain **all of these**. The minimum clickable audit reference should resolve to `session_file + line_number`; IDs and hashes protect against rewrites and duplicate ingestion.

❓ **Q36** - **Where should the SQLite database and configuration live?**

Possible locations:

- inside the current project;
- in a dedicated repository for the dashboard;
- under `~/.pi/agent/` alongside Pi data;
- configurable path, with a sensible user-level default.

➡️ **Recommendation:** Use a **configurable path with a user-level default**, for example `~/.pi/agent/usage/usage.sqlite`. Keep the parser configuration separate from the session archive and do not write analytics files into arbitrary client repositories.

❓ **Q37** - **How should the browser service be exposed?**

The data includes sensitive project and usage metadata. Choose:

- localhost only;
- LAN-accessible without authentication;
- LAN-accessible with authentication;
- configurable bind address and authentication later.

➡️ **Recommendation:** Start **localhost only**. Do not expose it to the LAN until authentication and threat boundaries are designed.

❓ **Q38** - **Are you authorising implementation after this round?**

The implementation would create the standalone parser/updater, SQLite schema, initial views/queries, and a small validation fixture. It would not yet build the marimo dashboard unless you ask for that separately.

➡️ **Recommendation:** Answer **yes** only if the decisions above are sufficiently settled. Otherwise identify the specific question that needs another branch.
