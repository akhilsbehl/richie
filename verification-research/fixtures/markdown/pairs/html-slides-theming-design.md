# Design v2: `html-deck` core + themes

Changes from v1: two repos, `default` + `minimalist` themes in core, Fractal theme stays
in its own repo, fail-closed lookup, `retheme` command. Sections 2, 4, 6 and 7 answer your questions.

## 0. What I found in `kintsugitoma.zip`

It is a **design system**, not a theme. It affects the contract. Facts:

| Fact | Consequence |
|---|---|
| React + Babel from unpkg CDN; inline-styled JSX; `Slides.jsx` holds 15 layouts | Cannot ship as-is. Core rule is no CDN, no framework, no build. I port the *look*, not the code |
| Fixed 1280×720 stage | Core uses fluid 16:9 (1600 max) plus mobile collapse. Re-express sizes in `clamp()` |
| Fonts via Google Fonts `@import` (Shippori Mincho B1, Zen Kaku Gothic New, IBM Plex Mono) | Must bundle as local `@font-face` woff2 (all OFL). Needs network. Zscaler may block. **Your call if it does** |
| No logo. Brand mark is the typeset word `kintsugitoma` | Logo slot must allow **text**, not only an image |
| Title and closing use an *ink* ground; the rest use paper | Core needs per-slide-type ground tokens. Fractal never needed this. Good test of the contract |
| Labels are 11 px | Core floor is 12 px. Theme labels get raised to 12 px. Deviation from the source system |
| Rule: "gold once per slide at most" | Theme-level rule, in theme SKILL.md. Not a core rule |
| Tokens are already CSS variables (`--ink-900`, `--gold-500`, `--text-primary`) | Direct reuse. I alias them to core semantic tokens |
| Cards-two/three/four layouts | Conflicts with core narration ("cards only for real peers"). I do **not** import them as defaults |

Open question: `statement` (one sentence pull-quote) and `full-bleed` (photograph) are useful
and brand-free. Add them as optional core slide types? My view: yes, `statement` only.

## 1. Repository layout

Two repos. Core knows nothing of Fractal. Fractal depends on core, never the reverse.

```
~/configs/skills/html-deck/            # NEW. Version-controlled in ~/configs
  SKILL.md                             # workflow, slide grammar, QA. No brand.
  VERSION                              # contract version, e.g. 1
  references/
    visual-narration.md                # moved out of SKILL.md
    theme-contract.md                  # what a theme MUST provide
  engine/
    base.css                           # layout, stage, print, responsive
    deck.js                            # keyboard + controls
  templates/deck.html                  # skeleton. Slots, zero colours
  themes/
    default/                           # from kintsugitoma.zip
    minimalist/                        # least branding
  scripts/
    new-deck.sh  --theme <name|path>
    retheme.sh   deck.html --theme <name|path>
    validate-deck.mjs
    qa.sh

~/warchives/fractal-skills/fractal-html-deck/   # STAYS. Becomes theme + thin skill
  SKILL.md                             # brand rules + "requires html-deck"
  theme/  theme.json  theme.css  assets/...
```

Core accepts `--theme` as a **name** (built-in) or a **path** (external). So core never
needs to know Fractal exists.

## 2. Slot resolution: explained with examples

A slot is a named hole in the core skeleton. The theme fills the hole.
"Scaffold-time" means a script fills the holes **once**, when it creates the deck.
The delivered `deck.html` is then plain static HTML.

**Core skeleton (brand-free):**

```html
<span class="logo" data-slot="logo"></span>
<footer class="footer"><span data-slot="footer"></span><span data-slot="page"></span></footer>
```

**Fractal theme.json fills them with images and a legal line:**

```json
"logo":   { "kind": "image", "light": "assets/logo-dark.png", "dark": "assets/logo-light.png" },
"footer": "Fractal × {{client}} · Confidential"
```

Result in the deck:

```html
<span class="logo" data-slot="logo">
  <img class="logo__light" src="assets/theme/logo-dark.png"  alt="" aria-hidden="true">
  <img class="logo__dark"  src="assets/theme/logo-light.png" alt="" aria-hidden="true">
</span>
<footer class="footer"><span data-slot="footer">Fractal × Acme · Confidential</span>…
```

**Default theme (typeset word, no image):**

```json
"logo":   { "kind": "text", "text": "kintsugitoma" },
"footer": "{{client}} · {{date}}"
```

Result: `<span class="logo" data-slot="logo">kintsugitoma</span>`

**Minimalist theme (nothing):**

```json
"logo":   { "kind": "none" },
"footer": "{{page}}"
```

Result: the logo span is removed. Footer shows a page number only.

The alternative (runtime) would ship a `theme.json` plus JS in the deck, and the
browser would fill the holes on load. That breaks "content usable without JS" and
makes the deck depend on a manifest at view time. **Recommendation stays: scaffold-time.**

Needed addition (from your `retheme` question): the script **keeps** `data-slot`
attributes in the output, so the holes stay findable. See section 4.

## 3. Class names: decision withdrawn

v1 proposed replacing the `.logo__light`/`.logo__dark` image pair with one element and
CSS `content:url()`. I drop that. Details are in section 7. The pair stays. The names are
mode names (image used in light mode / dark mode), not brand names. The scaffold writes
the pair from the slot. One decision fewer.

## 4. `retheme`: can the engine switch a finished deck to another theme?

**Yes, for structure and style. No, for content tuned to one theme.** Design:

1. Scaffold writes markers: `<style data-theme-css="fractal">…</style>`, assets under
   `assets/theme/`, and `data-slot` on every slot.
2. `retheme.sh deck.html --theme X`:
   - replaces the theme `<style>` block;
   - replaces `assets/theme/` and removes unused old files;
   - re-fills every `data-slot`;
   - leaves slide content untouched;
   - writes a `deck.pre-retheme.html` backup and refuses on a dirty/unmarked deck;
   - runs the validator for the new theme.
3. Core changes only through classes and tokens, never through inline colours. The
   validator therefore **forbids literal colours in slide content** (hex/rgb in `style=`).

What does **not** survive a re-theme. Report these; do not guess:

| Case | Example | Handling |
|---|---|---|
| Theme-specific rhythm | Default theme's "one large void" layouts | Warn; user reviews |
| Colour that carries meaning | Series in `--accent`, others in `--title` | Survives (token based) |
| Hand-made diagrams using fixed px | SVG with literal fills | Validator flags; manual fix |
| Slot kind changes | Fractal image logo → minimalist no logo | Slot removed; warn |
| Font metrics | Mincho serif vs Calibri line breaks | Visual review needed |

## 5. The theme contract (revised)

A theme is a folder: `theme.json`, `theme.css`, optional `assets/`.

**Tokens (semantic; core never names a colour).**
Required: `--accent --bg --surface --card --border --title --body --muted --on-accent --font`.
Optional: `--font-title --font-mono --secondary --chart-1..3`.
**New from the zip:** `--bg-title --bg-closing --bg-divider` (per-slide-type ground; default to `--bg`).

**Slot kinds:** `image` (light/dark variants) · `text` · `none`.
**Slots:** `logo`, `footer`, `page`, and `motif:<slide-type>`.

**Manifest rules** the validator reads (no hex in the validator any more):

```json
"rules": { "requiredTokens": {"--accent": "#F7A800"}, "logoOnlyOn": ["title","closing"] }
```

**Core invariants a theme cannot override:** 12 px text floor, keyboard navigation,
print 16×9 pages, contrast checks, relative asset paths, no remote assets, alt rules.

## 6. Slide-type overrides: pros and cons, to test before choosing

Question: may a theme replace a slide type's whole HTML, or only fill slots and add CSS?
I will test both on `default` and `minimalist` (migration step 6) and report evidence.
Hypotheses before testing, marked as such:

| | **Slots + CSS only** | **Allow full-HTML override (title, closing)** |
|---|---|---|
| Pro | Core invariants (footer, print, a11y) cannot break | Any composition is possible |
| Pro | `retheme` works cleanly: same markup everywhere | — |
| Pro | Validator stays simple | — |
| Con | Layout moves are limited to what CSS grid can do | `retheme` breaks: markup differs per theme |
| Con | Default's title (label top-left, seam rule under title, ink ground) may need awkward CSS | Validator must understand each variant |
| Con | — | Theme can silently drop footer or page number |

Pointers from the zip (hypothesis): Fractal title is centred; Default title is left-aligned
with a seam rule. Both look reachable with CSS on the same markup. If the test shows that,
CSS-only wins. If Default needs a different DOM order, I report it, and you choose.

Test method: build the same 5-slide deck in `default`, `minimalist`, and a Fractal stub with
CSS only; screenshot desktop, 390 px, PDF; list each place CSS was awkward.

## 7. Logo modes and print: explained

Fractal ships **two logo files**. One is dark ink (for white slides). One is white (for navy slides).
The deck must show the right one for the current mode.

**Option A (current):** two `<img>` tags, CSS hides one.

```html
<img class="logo__light" src="logo-dark.png"  alt="" aria-hidden="true">
<img class="logo__dark"  src="logo-light.png" alt="" aria-hidden="true">
```

**Option B (my v1 idea):** one tag, CSS swaps the file.

```css
.logo { content: url(logo-dark.png); }
[data-theme="dark"] .logo { content: url(logo-light.png); }
```

Why B is risky:

| Risk | What happens |
|---|---|
| Path base | `url()` in CSS resolves against the CSS file, not the HTML. Inline vs external CSS gives different paths |
| Alt text | Generated content has no dependable alt. Screen readers may skip the logo |
| Validator blindness | The HTML contains no `<img src>`. The missing-asset check cannot see it |
| Print | Print may differ on background vs content images. Needs a PDF test |

A has none of these. Cost: two tags. The scaffold writes them, so the cost is zero for the author.
**Decision: keep A.**

## 8. Fail-closed dependency (Fractal → core)

Plain agent instructions, not a software mechanism. `fractal-html-deck/SKILL.md` opens with:

1. Find `html-deck`: `$HTML_DECK_DIR`, else `~/.pi/agent/skills/html-deck`.
2. Check `SKILL.md` exists and `VERSION` ≥ the theme's `requires.html-deck`.
3. If either check fails: **stop**. Tell the user `html-deck` is missing or too old. Do not
   rebuild the engine, copy a stale template, or continue.
4. Otherwise read `html-deck/SKILL.md` and follow it, with `--theme <this-skill>/theme`.

Note: `~/.pi/agent/skills/*` already symlinks to `~/configs/skills/*` for `explain-diff`
and `query-ms-graph`. `html-deck` follows the same pattern.

## 9. Decisions (updated)

| Decision | Outcome |
|---|---|
| Repos | Two. Core in `~/configs/skills/html-deck`. Fractal stays |
| Core name | `html-deck` (your comment). v1 said `html-slides`. **Confirm** |
| Built-in themes | `default` (from zip), `minimalist` |
| Slot resolution | Scaffold-time, markers kept for `retheme` |
| Logo markup | Keep image pair. Add `text` and `none` kinds |
| Slide-type treatment | Structure in core; decoration rules in theme. Agreed |
| Narration doc | `references/visual-narration.md`. Agreed |
| Theme distribution | By name (built-in) or path (external) |
| Override policy | **Open.** Decide after the section 6 test |

## 10. `minimalist` theme: definition

"Least branding" means:

- no logo, no motifs, no footer brand text; footer is the page number only;
- one neutral accent (near-black or a single desaturated blue), used for emphasis and focus;
- system font stack; no web fonts; no bundled assets;
- white and near-black grounds only; no tinted panels;
- hairline rules; no shadow on slides beyond the stage lift.

This makes it the **contract's lower bound**. If a theme with zero assets works, the contract is lean enough.

## 11. Migration (each step passes `qa.sh`)

1. Create `~/configs/skills/html-deck` as a git-tracked skill. Move engine, skeleton, narration.
2. Tokenise: semantic tokens only. Add per-slide-type grounds.
3. Add slots and `data-slot` markers. Scaffold substitution.
4. Split validator: generic checks + `rules` from `theme.json`. Add literal-colour check.
5. Build `minimalist`. It is smallest and proves the lean case first.
6. Build `default` from the zip: port tokens, bundle fonts locally, port 5 slide types.
7. Run the section 6 test. Report pros and cons. **You decide the override policy.**
8. Add `retheme.sh`. Test: Fractal → default → minimalist → Fractal. Diff against original.
9. Convert `fractal-html-deck` to theme + fail-closed skill. Remove its copy of the engine.
10. You ask for one deck per theme. I build them and show screenshots.

## 12. Risks

- **Font download blocked by Zscaler.** Default needs 3 font families. Fallback: system serif/sans and flag the loss of fidelity. Your call.
- **Zip licence and provenance.** The README says the system is "an original application" with substituted fonts. I treat it as yours. Confirm nothing in it is third-party restricted.
- **`retheme` promise.** It guarantees structure and style only. Hand-built diagrams may not follow. The validator catches literal colours, not all cases.
- **Discovery.** A user who triggers `fractal-html-deck` on a machine without core hits the stop message. That is the intended behaviour.
- **Contract still young.** Three themes (Fractal, default, minimalist) is a better test than one. A fourth would be better. Not required now.

## Questions

1. Core name: `html-deck` or `html-slides`?
2. Add `statement` as an optional core slide type?
3. If fonts cannot be downloaded, accept system-font fallback for `default`?
4. OK to keep a `deck.pre-retheme.html` backup, or do you rely on git?
