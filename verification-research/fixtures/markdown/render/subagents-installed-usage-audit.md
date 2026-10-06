# Installed subagents: usage and context audit

## Objective

**Retain `pi-subagents` 0.76.1. Simplify its exposed surface before considering replacement.** The installed implementation already has lazy activation and real schema pruning. A smaller home-built runner could remove features, but no measured evidence yet shows a material advantage over those controls. Replacement must preserve the lifecycle features that genuine sessions already use.

## Problem Statement

Separate three costs: model-visible tools and instructions; growing conversation history; runtime storage. A large installed package does not imply that all its documentation enters each request.

## Context & Scope

Read-only snapshot on 2026-10-06. Scope: installed implementation, loading, agents, dispatch prompts, three genuine prior sessions, context burden, and future swarm/project-session fit.

Path keys below resolve to exact absolute paths:

- **P** = `/home/akhil/.pi/agent/npm/node_modules/pi-subagents`
- **D** = `/home/akhil/.pi/agent/install/releases/1.0.4/node_modules/@earendil-works/pi-coding-agent/docs`
- **C** = `/home/akhil/configs`
- **S** = `/home/akhil/.pi/agent/sessions`

**Fact** means directly read code/config or counted persisted data. **Estimate** means character-based token conversion. **Inference** means a recommendation or extrapolation. No private task bodies or credentials are reproduced.

### Installed identity and actual loading — facts

| Item | Evidence |
|---|---|
| Installed package | `P/package.json:1–15`: `pi-subagents`, **0.76.1**, Nico Bailon, MIT; repository `https://github.com/nicobailon/pi-subagents`. Installed compiled JS plus source maps. Exact source commit was not established. |
| Configured source | `C/pi/settings.json:29–35`: unpinned `npm:pi-subagents`; all four package resource arrays are empty. This disables normal resource discovery, **not the manual wrapper**. |
| Active loader | `/home/akhil/.pi/agent/extensions/pie-damare.ts` is a symlink to `C/pi/extensions/pie-damare/damare.ts`. Its `:82–124` resolves the managed package; `:307–371` invokes its factory. `.ts` falls back to `.js`. |
| UI wrapper | `damare.ts:325–365,373–394` changes rendering and forwards model-facing definitions/results. It does not reduce their context. Background results remain context messages. |
| Child guard | `damare.ts:308–310` skips this parent registration under `PI_SUBAGENT_CHILD=1`; `P/index.js:3–8` also makes ambient child copies inert. Native child runtime tools are supplied separately. |
| Package-specific config | `P/src/extension/config.js:208–209,235–254` loads `/home/akhil/.pi/agent/extensions/subagent/config.json`. That file is **absent**. Description/feature/activation defaults therefore apply. This is distinct from `settings.json` agent settings. |
| Builtins | `C/pi/settings.json:66–68` disables builtin agents. `P/src/agents/agents.js:1310–1311` implements this. It does not shrink the parent tool schema. |
| Runtime proof | Prior session A below records `subagents_enable`, then the full `subagent` declaration. The configured wrapper is not merely installed but unused. |

Jina read of `https://github.com/nicobailon/pi-subagents` confirms the upstream identity and foreground/background model. The mutable web README is not used as proof of installed-version capabilities. Local code takes precedence.

### Definitions and dispatch — facts

There are **11** personal definitions in `C/pi/agents`, linked from `/home/akhil/.pi/agent/agents`.

| Group | Definition evidence | Effective design |
|---|---|---|
| Fresh workers | `{tanuki,kitsune,oni,rasetsu,akuma,kyubi,tatsu}.md:1–27` | Native Pi models; append prompt; project context and skills enabled; async true; no nested fanout; max depth 1; turn budgets 32–128 plus grace; deadlines 5–60 min; writer acceptance role. |
| Fork advisors | `{saaqi,wazeer,saarthi}.md:1–28` | Fork default; foreground; read-only acceptance role; depth 1; no nested fanout. These files do not specify an OS sandbox or restrictive tool list. |
| Codex engine | `codex.md:1–23` | External `codex exec`; stdin prompt; ephemeral; skip Git check; approve-for-me; explicit model/reasoning; async true. This is a different runner contract, not just a model choice. |

- None of the 11 files opts into `advertise:true`. `P/src/agents/advertised-agent-prompt.js:30–35` only advertises explicit opt-ins. **Current automatic package roster contribution is zero for these definitions.** Discovery/list results are separate transcript costs. Catalog limits are 16 agents, 12,288 bytes, 512 description bytes (`:3–5`).
- `C/pi/prompts/delegate.md:1–6` and `diy.md:1–5` are persistent **model instructions**, not runtime activation/permission switches. DIY does not unload already active tools. Delegate does not enforce confirmation gates in code.
- Latest `C/SUBAGENT_DISPATCH_PRINCIPLES.md:9–30` matches the 11 definitions and gives confirmation gates for akuma/kyubi/tatsu/saarthi. The file changed during this audit: the earlier snapshot lacked wazeer and named absent sonnet/opus/fable. Latest evidence supersedes that discrepancy. This agent made no change.
- The latest dispatch file is 2,106 bytes; delegate is 481; DIY is 385. Rough text costs: 527, 120, 96 tokens. They enter history when read/expanded, not automatically as one permanent package roster. A mode switch adds new text; it does not erase the old switch.

**Important correction:** dispatch `:24,35` overstates inheritance. Fresh excludes parent conversation, not all discovered resources. File agents default global-context inheritance **false** (`P/src/agents/agents.js:1916–1927`); these native definitions enable project context and skills explicitly. Child resource loading disables prompt templates (`P/src/runs/shared/child-session.js:353–363`). Foreground children do not load ambient extensions (`P/src/runs/shared/child-launch.js:106–111`); background children normally can. `extensions:[]` disables ambient extensions, including provider extensions (`child-tool-plan.js:272–299`). Do not apply it blindly to a child that needs Jina, browser tools, or a custom provider.

## Constraints

No source/config changes, installs, new repos, launches, or richie invocation. Only this report is written. CWD `/home/akhil/warchives/minions` is empty and is **not a Git repo**. `git rev-parse` fails there; no staged-file claim is invented for it. In `C`, `git status --short` shows existing changes to dispatch/settings and untracked `more.md`; `git diff --cached --name-only` is empty. The audit did not stage anything.

## Instructions for what to do

### Installed feature inventory

| Family | Implementation evidence | Use / preliminary decision |
|---|---|---|
| Single native and external children | `P/src/extension/schemas.js:201–250`; `src/runs/foreground/subagent-executor.js:6977–7424`; local `codex.md` | Keep. Native model selection and external engine requests have different validation needs. |
| Scripts, parallel groups, lane pipelines | `src/workflows/scripted-workflow.js:392–446,524`; `src/extension/tool-description.js:22–48` | Implemented, not just a README promise. Sample B uses `runs.all` and `runs.run`. Keep scripts initially; consider structured-only after replaying real workflows. |
| Small parallel/chain alternative | `src/extension/schemas.js:261–290`; `src/extension/public-execution.js` | Disabling `workflow-scripts` exposes `tasks` and `chain` instead. This is a supported narrower interface, not loss of all multi-child work. It is not equivalent to scripts/lanes. |
| Async control, status, resume, steering | `src/runs/foreground/subagent-executor.js:6252` and action dispatch; `src/runs/background/result-watcher.js:402–539` | Keep. All samples use lifecycle controls. Failed steering is observed; delivery receipts are not proof of child compliance. |
| Supervisor requests | `src/runs/shared/child-launch.js:132–136`; `src/extension/index.js:712–719` | Keep. Native child/parent coordination does not require external intercom installation. Sample C contains a failed send; this path needs validation, not deletion. |
| Wait/provider/detached work | `src/extension/schemas.js:292–310`; `src/runs/background/auto-drain.js:1–81` | Keep lifecycle behavior. Wait tool removal must not be confused with canceling work or a nonblocking wake subscription. Headless auto-drain preserves owned work; it stops for pending supervisor decisions and reports errors/timeouts. |
| Acceptance, output binding, file-only return | `src/runs/shared/acceptance.js:212–230,378–379,503–549,1075`; `single-output.js:254–264` | Keep. Samples use acceptance, output artifacts and resume. `file-only` returns a saved-output reference instead of the body. It reduces parent results, not schemas or child generation. Independent review remains an orchestration requirement. |
| Worktree/lane ownership | `src/runs/foreground/subagent-executor.js:6219–6231`; `src/shared/disabled-features.js:25–28` | Keep until writer-isolation requirements are resolved. CWD is not confinement. This audit did not create or test a worktree. |
| Agent mutation/refinement | `src/shared/disabled-features.js:8–11`; executor `:114–115` | No sampled use. Safe first candidate to remove from the model surface. Files can remain operator-maintained. |
| Watchdog; budgets; permission rules | `src/shared/disabled-features.js:12–15,32–35`; `src/runs/shared/child-tool-plan.js:258–280`; `subagent-control.js:7–15` | Watchdog management was not sampled. Preserve runtime deadlines, turn/spawn limits, required extensions and native permissions. Disabling per-call budget fields does not disable configured defaults, but removes useful override authority. |
| Missions/schedules | `src/runs/foreground/subagent-executor.js:6663`; `src/extension/index.js:727–729`; `src/shared/disabled-features.js:20–23,40–43` | Mission IDs occur automatically in sample launch results; explicit mission/schedule management does not. Do not call missions wholly unused. Schedules are a reasonable optional cut. |
| Project panes / inspectors / external machines | `src/inspectors/herdr/project-panes.js:257–260,403–461`; `src/shared/disabled-features.js:16–19,37` | No sampled use. Not needed for current delegation. Relevant to the independent-root goal, so any cut should be reversible. `herdr` is not on this process's PATH. |

**Swarming fit — inference from implementation:** current primitives cover bounded fanout, parallel work, lane-local sequences, control and result collection. They do not prove an autonomous peer-to-peer swarm policy. Keep those needs distinct.

**Independent roots versus nested children — fact/inference:** `project.open` starts an ordinary Pi command in a Herdr project pane (`project-panes.js:257–260,446–461`). It is not a depth-2 child launch. Such a root can own its own children, subject to its own resources/config. The public contract labels trust `human-verification-required` (`:10–12`). By contrast, nested children require explicit fanout authorization (`child-tool-plan.js:199–203`) and obey depth caps (`src/shared/types.js:184–201`). Current native profiles deny nesting and cap depth at 1. Raising depth alone is insufficient. No pane/root launch was tested. A firstmate-like product may still need independent session scheduling, UI and ownership policy; replacing the child runner is not yet justified by that gap.

### Genuine usage sample

Sampling frame: metadata scan of top-level JSONL files in three folders: configs, richie, zellij-pane-switcher. Selection: one recent config task; one script-heavy development task; one resume/supervisor task. Excludes this audit and subagent artifact transcripts. This is **purposeful, not random**. It overweights developer/control workflows; absence is not proof of never-used features. Counts include all persisted entries, not a reconstructed active branch. Earlier package versions may differ.

Exact session paths:

- **A:** `S/--home-akhil-configs--/2026-10-04T02-43-41-080Z_01a104cb-b396-751d-bbb4-e05652a10d42.jsonl`
- **B:** `S/--home-akhil-warchives-richie--/2026-09-15T09-01-57-788Z_01a0a44d-329c-7091-814f-7defbca3ed72.jsonl`
- **C:** `S/--home-akhil-warchives-zellij-pane-switcher--/2026-08-29T19-25-55-805Z_01a04efc-58dd-7760-81a6-e23cb8b827d3.jsonl`

| Session | Observed calls | Concrete evidence |
|---|---|---|
| A | 1 enable; 4 direct async launches; 1 steer | `:11–16` loader then schema then kitsune launch; `:19–26` oni/tanuki; `:43–48` kitsune + steer. Shapes `{agent,task,async:true,output?}`. Returned context fresh. No scripts or fork. |
| B | 2 list; 1 guide; 5 launches; 3 status; 3 steer; 1 supervisor pending; 1 resume | `:88–104` list/guide/script with `runs.all` and `runs.run`, status/steer; `:110–114` foreground tanuki and script; `:125–146` pending/status/scripts/resume. Four scripted launches; explicit fresh, time/tool/usage budgets, preflight. One steering result fails at `:104`; status fails at `:130`. |
| C | 1 list; 2 launches; 1 supervisor send; 2 steer; 2 resume | `:13–20,31–32,43–56`. Shapes include oni, fresh, async, acceptance, isolation, timeout, toolBudget. Supervisor send fails at `:18`; steering and resume return success. Do not treat every advanced call as working. |

Measured model-visible text totals across raw entries:

| Session | Tool results | Notification text | Raw session disk |
|---|---:|---:|---:|
| A | 4,608 chars / 6 results | 23,470 chars / 4 notices | 228,412 bytes |
| B | 55,393 chars / 16 results | 15,945 chars / 13 notices | 754,779 bytes |
| C | 7,475 chars / 8 results | 9,575 chars / 6 notices | 235,015 bytes |

B's one guide read alone returns **36,460 chars** (`:91`). Discovery/guide/result verbosity can exceed savings from many static-field cuts. Notification text is model context even when Damare hides it. Raw result `details`, signatures, transcripts and runtime files are not all model-visible text.

### Static context burden and supported reductions

Measurement method: invoke the installed **pure** `createSubagentParamsSchema` and `buildSubagentToolDescription` functions in memory; no extension registration. Resolve TypeBox to the host's existing module; substitute the four literal `MAX_ARGS_*` constants from `workflow-resources.js:6–9`. Count `JSON.stringify(schema).length` plus description characters. This measures generated artifacts, **not provider tokenization**.

| Surface | Top-level fields | Schema chars | Description chars | Combined | Approx. tokens at chars/4 |
|---|---:|---:|---:|---:|---:|
| Current defaults | 81 | 12,982 | 5,497 | 18,479 | 4,620 |
| Explicit compact | 81 | 12,982 | 5,497 | 18,479 | 4,620 |
| Explicit full | 81 | 12,982 | 6,785 | 19,767 | 4,942 |
| Optional-surface trim below | 61 | 9,409 | 5,469 | 14,878 | 3,720 |
| Same, structured-only | 58 | 8,674 | 4,147 | 12,821 | 3,205 |
| All listed feature families off | 42 | 6,255 | 4,134 | 10,389 | 2,597 |

Optional-surface measurement disabled: `agent-management`, `watchdog`, `panes`, `spawn-budget-grants`, `lane-metadata`, `gates`, `control-overrides`, `extension-bindings`, `external-machines`; plus `scheduledRuns.enabled:false`. **This is a measurement scenario, not a blanket final config recommendation.** Structured-only adds `workflow-scripts` and `preflight`. All-off removes missions/budget overrides/lane management too and is **not recommended**.

- **Real schema pruning:** `src/extension/schemas.js:276–290` removes fields. `src/shared/disabled-features.js:84–101` and executor `:4647–4654` reject disabled requests. This is not cosmetic hiding. Optional trim saves 3,601 chars, about 900 estimated tokens (19.5%). Structured trim saves 5,658 chars, about 1,415 (30.6%).
- **Compact is already the default:** explicit `toolDescriptionMode:"compact"` saves **zero** versus current. `tool-description.js:60–66,157–179` separates implicit/default metadata and explicit modes. Do not claim the default carries the longer full description.
- **Lazy activation:** `tool-activation.js:20–30,35–68,76–119` gates on model compatibility in auto mode, restores recorded selection, and only activates `subagent` on request. A records a 337-char loader description + 33-char schema at `:4`; full schema arrives at `:14`. Before activation it avoids roughly the 18.5k-char declaration, less the small loader. Wait and supervisor remain.
- A's `bg_wait` declaration is **2,275 description + 2,058 schema chars**; supervisor is **130 + 232** (`A:4`). Cold-parent overhead therefore is not zero. Combined cold loader/wait/supervisor is 5,065 chars, about 1,266 estimated tokens, before prompt snippets. Enabled total including these retained declarations is about 23,544 chars / 5,886 estimated tokens. Host/provider wrappers can differ.
- A's recorded full schema is 13,005 chars, versus 12,982 from the pure builder. Count definitions/metadata consistently; use these as character measurements, not exact token claims.
- The automatic advertised roster is currently absent. Removing profiles or disabling more builtin agents therefore saves no current automatic roster text. Listing capabilities adds results to history.
- `custom` descriptions can reduce prose but retain mandatory safety guidance (`tool-description.js:140–179`). They do not shrink parameters.
- Native `setActiveTools`, CLI exclusions and deferred/hidden exposure exist (`D/extensions.md:172–219`). The package uses `model-only` (`P/src/shared/extension-context.js:1–7`), not general codemode access. Builtin tool search/codemode are disabled in `C/pi/settings.json:69–74`. Do not assume toggling codemode will lazily wrap this orchestrator.
- `waitTool.enabled:false` changes wait behavior, not necessarily schema registration. Do not use it as a context-saving substitute for excluding a tool. Exclusion loses model access to that lifecycle function.
- `--no-extensions` avoids the manual wrapper too but also removes unrelated extensions. Removing only the package's normal resource declarations achieves nothing here: they are already empty.

**Provider-reported tokens:** A's `:6` reports input 4 + cacheRead 22,231 + cacheWrite 286, output 6 (total 22,527). A's `:8` reports input 4 + cacheWrite 22,553, output 149 (total 22,706). These are actual request-level usage fields, **not package-only attribution**. A's system sections at `:4` include browser instructions 33,859 chars, skills 4,155 and project context 3,316. Do not blame all initial context on subagents. Cache reads still occupy context; they have different billing from fresh input.

**Inheritance/fork/results:** static declarations stay in the effective request after activation; Pi need not duplicate their raw text into each stored turn. Fresh children avoid parent-history cost but still get their own tools/resources. Fork advisors replay parent context subject to child-boundary filtering (`subagent-prompt-runtime.js:190–218`); forks can inherit large task history. Optional pruned forks make an extra summarization call and need an explicit model (`src/shared/pruned-fork.js:388–427`). No fork usage or actual pruned-fork savings was measured in the three samples. `outputMode:"file-only"` limits result bodies; `includeProgress:false` avoids full progress; neither removes static declarations. More selective tool/skill/extension lists reduce child loadouts only if required providers/tools remain.

**Disk is separate:** `du -sh` reports package 16 MB, missions 5.5 MB, configs-folder subagent artifacts 2.2 MB. This is not token cost. A's referenced async run directory has expired; retained child transcripts and exact child first-request tokens could not be measured. Parent session data remains. Pi's `custom` entries and result details are excluded from model context; `custom_message` content is included (`D/session-format.md:217–266`).

## Instructions for what to not do

- Do not replace the runner merely to remove unused action names. Use supported pruning first.
- Do not remove deadlines, nesting ceilings, spawn accounting, result delivery, cancellation, resume identity, supervisor decisions, output binding or failure propagation.
- Do not treat read-only acceptance labels, a worktree, or cwd as an OS security boundary (`D/security.md:1–25`).
- Do not infer automatic swarming, guaranteed peer coordination, or independent-root reliability from child fanout alone.

## Definition of Done

Preliminary decision: **retain and narrow**.

1. Keep current lazy activation. Verify fresh DIY sessions remain cold on the actual selected provider; resumed activated sessions can remain hot by design.
2. First remove agent mutation/refinement, schedule controls and remote-machine overrides if the operator confirms no use. Avoid cutting supervisor/wait/budget/lifecycle controls.
3. Keep scripts until the script-heavy B workflow is reproduced with the structured alternative. The smaller schema is useful, but not yet evidence of equal capability.
4. Prefer bound `file-only` outputs and short completion summaries for long reports. The samples show large dynamic result costs.
5. Correct the blanket inheritance claim. Verify the foreground advisor tool loadout before assuming inherited Jina/browser extensions.
6. For independent project roots, test a root-session host separately from nesting. Herdr project panes are implemented but unverified here and lack a PATH prerequisite. A small root-session UI/host may be the appropriate personal component; that does not require a replacement child executor.

## Verification

Read the full Pi README and relevant extension/package/SDK, skills, prompt-template, TUI, configuration/settings, session/context, session-format/message-types, how-Pi-works, security and compaction references. Read installed package code/config and all personal definitions. Ran JSONL metadata/size scans, in-memory pure-builder measurements, read-only Git checks and a Jina upstream identity read. No launches or integration tests.

## How you will be graded

Evidence is sufficient for an independent source review. It is not a performance benchmark or full security review. Limits: purposeful three-session sample; raw-entry counts rather than active-branch reconstruction; mixed historical versions; expired child runtime records; no provider-specific package tokenizer; no exact upstream commit; no swarm/project-root execution test; concurrent config edits. A replacement should only win after matching the observed control/output paths and showing lower measured request burden or a necessary independent-root capability.

## Revision Log

- 2026-10-06: Initial installed/usage audit. Retain-and-narrow recommendation. Updated routing evidence after concurrent roster correction. No existing files changed.

```acceptance-report
{
  "criteriaSatisfied": [
    {"id":"criterion-1","status":"satisfied","evidence":"Completed research-only installed/config/session audit. Only the authorized report artifact was written; no implementation, installation, configuration, repo creation or child launch."},
    {"id":"criterion-2","status":"satisfied","evidence":"Exact source paths/ranges, three genuine session paths/ranges, observed failures, generated schema measurements, request usage, Git state and limitations are recorded."}
  ],
  "changedFiles":["/home/akhil/.richie/ephemeral/subagents-installed-usage-audit.md"],
  "testsAddedOrUpdated":[],
  "commandsRun":[
    {"command":"Read installed package/config/agent and complete relevant Pi docs via cat/read/nl/rg","result":"passed","summary":"Identified pi-subagents 0.76.1, manual Damare loading, defaults and implementation surfaces."},
    {"command":"Python JSONL metadata and character-count scans over three genuine prior sessions","result":"passed","summary":"Observed direct and scripted launches, lazy activation, lifecycle controls and failed supervisor/steer/status results."},
    {"command":"node --input-type=module: installed pure schema/description builders loaded in memory","result":"passed","summary":"Current 81 fields/18,479 chars; optional trim 61/14,878; structured trim 58/12,821. No registration or filesystem writes."},
    {"command":"git -C /home/akhil/configs status --short; git diff --cached --name-only","result":"passed","summary":"Existing unstaged changes and untracked more.md; staged path list empty."},
    {"command":"git -C /home/akhil/warchives/minions rev-parse --show-toplevel","result":"failed","summary":"CWD is not a repository. No repository created."},
    {"command":"Jina read https://github.com/nicobailon/pi-subagents","result":"passed","summary":"Upstream identity corroborated; mutable web README not treated as installed code proof."}
  ],
  "validationOutput":["No package-specific config file present.","No current profile opts into advertise:true.","All source/config inspection was read-only; sampled task bodies and credentials were not reproduced."],
  "residualRisks":["Nonrandom sample and mixed historical versions.","Character-based estimates are not provider-token counts.","Expired child run artifacts prevent actual child/fork token measurement.","Independent project roots and swarm execution were not tested.","Supervisor reviewer gate remains external to this report."],
  "noStagedFiles":true,
  "diffSummary":"New authorized research report only.",
  "reviewFindings":["No audit-write scope blockers.","Dispatch automatic-inheritance statement is broader than installed implementation.","No material superiority of a replacement is established."],
  "manualNotes":"Configs repository was already dirty and changed concurrently. This agent made no existing-file edits. CWD is outside Git. Required independent review is pending."
}
```
