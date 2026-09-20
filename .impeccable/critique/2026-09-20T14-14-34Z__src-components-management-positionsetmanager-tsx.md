---
target: the "Portfolio" concept naming/scope (Screener + tax settings)
total_score: 5
max_score: 16
na_heuristics: 1,3,7,8,9,10
p0_count: 0
p1_count: 1
target_identity: "file:/Users/goul/Development/portfolio-tracker/src/components/management/PositionSetManager.tsx"
target_fingerprint: "sha256:e903674f0f2c99a00e6ea8f1afce99649b0ada678a015bc0397a827c744c87c8"
target_path: /Users/goul/Development/portfolio-tracker/src/components/management/PositionSetManager.tsx
timestamp: 2026-09-20T14-14-34Z
slug: src-components-management-positionsetmanager-tsx
---
Method: dual-agent (A: design-review sub-agent · B: detector/browser-evidence sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | n/a | Not a status-feedback question |
| 2 | Match Between System & Real World | 1 | "Portfolio" reads as "my holdings" in plain usage; `import.title` ("Load a portfolio") and `sets.empty` reinforce the narrow reading — stretching the word to also mean watchlist+tax+settings fights the model it already set |
| 3 | User Control and Freedom | n/a | Not affected by a naming/scope decision |
| 4 | Consistency and Standards | 1 | Confirmed live: sidebar says "Portfolio" (singular), mobile nav says "Portfolios" (plural), the manager panel heading says "Your portfolios" — three terms for one concept, plus "position set" at the code/API level |
| 5 | Error Prevention | 1 | Tax residence is a global, unkeyed setting (`taxSettingsBackup.ts:18-38`) that gets silently overwritten on import with no confirmation dialog, despite being bundled into every portfolio export — the export UI implies it's portfolio-scoped when it isn't |
| 6 | Recognition Rather Than Recall | 2 | User must recall which of three terms means what; Screener carries zero indicator either way of whether it's portfolio-scoped |
| 7 | Flexibility and Efficiency of Use | n/a | Not applicable to this decision |
| 8 | Aesthetic and Minimalist Design | n/a | Covered under emotional-tone finding below, not visual density |
| 9 | Error Recovery | n/a | The tax-overwrite issue is silent data loss, not a diagnosable error state |
| 10 | Help and Documentation | n/a | No help surface exists for this concept |
| **Total** | | **5/16** | **Poor (31%)** |

## Design Specificity Verdict

**LLM assessment**: "Portfolio" doesn't yet carry the weight of "my investing profile." In ordinary financial English it means specifically a collection of holdings — the product's own copy agrees with that narrow reading (`sets.empty`: "load a file to start", `import.title`: "Load a portfolio"). Critically, the premise that Portfolio already scopes tax settings turns out to be only true at the export-file level, not in the data model: tax residence lives in a global, unkeyed localStorage key, not a per-set one — switching portfolios does nothing to it, but importing one silently overwrites it. So the container is already stretched thinner than it looks before Screener enters the picture at all.

**Deterministic scan**: `impeccable detect --json` on `AppSidebar.tsx`, `PositionSetManager.tsx`, `ImportSetModal.tsx`, `screener/page.tsx` — exit 0, zero findings. This is expected and telling: a naming/IA/data-scoping problem like this is invisible to a mechanical CSS/DOM scanner by construction; it only surfaces by reading the actual storage keys and live copy, which is what both assessments did instead.

**Visual overlays**: Injection wasn't attempted (judged disproportionate for a naming question, per the task's own fallback allowance) — no `[Human]`-tab overlay exists to point you at. Evidence instead came from live `read_page`/`get_page_text` capture of the sidebar, the portfolio manager panel, and the Screener page, which is where the terminology drift (heuristic 4) and the absent scope-indicator (persona section below) were directly confirmed, not inferred.

Where the two assessments agree: neither found a rendering defect — the problem is entirely in copy and data-model consistency, and both independently landed on "keep the name, fix the drift" rather than "rename."

## Overall Impression

The instinct that "Portfolio" should either expand or get renamed is solving the wrong layer. The actual gap is that the concept is already inconsistently named in production (three live terms) and inconsistently scoped in storage (tax settings are bundled into exports but not actually keyed per portfolio, so import silently clobbers them) — independent of anything to do with Screener. Adding Screener into an already-cracked container, or renaming the container to paper over the cracks, would compound rather than fix the problem. The single biggest opportunity here is boring and correct: keep "Portfolio" narrow and real-world-accurate, fix the drift, and fix the tax-scoping bug — then Screener's genuinely-correct current behavior (global, shared across portfolios) needs no change at all.

## What's Working

- The tax-settings merge-on-import logic for per-account settings (as opposed to residence, which is overwritten) is a deliberate, well-reasoned tradeoff, documented in its own code comment — good engineering judgment already present.
- Screener's global, unscoped storage is accidentally correct for the real product need: a research watchlist naturally belongs to the person, not to one account/portfolio, so a user with multiple portfolios (e.g. modeling different accounts) isn't forced to re-pin the same ticker in each one.
- Onboarding copy ("Enter a ticker, quantity and cost — it takes about a minute") is disciplined and matches the brand's "precise, measured, quiet" voice — worth explicitly protecting from any rename that would gesture at broader scope.

## Priority Issues

**[P1] Tax residence is silently overwritten on import despite looking portfolio-scoped.**
Why it matters: `taxSettingsBackup.ts:35-38` overwrites the global residence value whenever any portfolio is imported, with no confirmation dialog and no disclosure in `ImportSetModal.tsx` (confirmed live — its copy never mentions tax settings at all). A user with two portfolios modeling different accounts loses their residence setting silently the moment they import/switch context via a file. This is a correctness/trust gap, not a naming one, and it exists today regardless of what happens with Screener.
Fix: Either make residence genuinely per-portfolio (matching what export already implies), or add an explicit confirm step on import ("This will replace your tax residence setting — continue?").
Suggested command: $impeccable harden

**[P2] Three different terms for one concept, confirmed live in the running app.**
Why it matters: sidebar = "Portfolio", mobile nav = "Portfolios", manager panel = "Your portfolios", code = "position set". This is the actual heuristic-4/6 cost today — a rename would only be worth doing if it also fixes this, and not renaming still leaves this unfixed.
Fix: Pick one user-facing term (recommend keeping "Portfolio") and apply it consistently across `sidebar.activePortfolio`, `nav.portfolios`, `home.yourPortfolios`.
Suggested command: $impeccable clarify

**[P2] Export filename doesn't reference "portfolio" at all.**
Why it matters: `${name}-transactions.json` (`PositionSetManager.tsx:96`) is a fourth naming register the user meets in their Downloads folder, disconnected from any on-screen term.
Fix: Align the filename convention with whatever term wins P2 above.
Suggested command: $impeccable clarify

**[P3] Import/export flow discloses nothing about what is or isn't included.**
Why it matters: confirmed live — `ImportSetModal.tsx` never states that tax settings are bundled or that Screener state is excluded. A user has no way to know what a "portfolio file" actually contains without reading source.
Fix: One line of disclosure copy in the export/import UI ("Includes positions and tax settings").
Suggested command: $impeccable clarify

**[P3] `taxes.residenceHelp` copy is ambiguous about scope.**
Why it matters: "One value for the whole portfolio — this is a property of you, not any one account" contrasts portfolio-vs-account but never states it's actually cross-portfolio, which is the more surprising fact.
Fix: Reword to state the real scope directly.
Suggested command: $impeccable clarify

## Persona Red Flags

**Jordan (first-timer)**: Primed by `import.namePlaceholder` ("My Portfolio 2025") to think of a portfolio as one dated snapshot of holdings — the narrowest possible reading. Would be confused by any renamed onboarding term appearing right next to `welcome.subtitleAfter` ("— not your real portfolio"), a term mismatch mid-flow.

**Alex (power user, multiple portfolios)**: Directly exposed to the P1 tax-overwrite bug with no warning. Also the one who actually reads both the desktop sidebar ("Portfolio") and, if ever on mobile, the bottom nav ("Portfolios") in the same week — the terminology drift is invisible to a single-portfolio first-timer but real for exactly the user this question is about.

## Minor Observations

- The manager panel's only visible row action with a single (demo) portfolio present is "Save to file" — rename/delete are conditionally hidden for the demo set, so this critique couldn't observe the switch-confirmation UI directly; corroborated instead via source (`activateSet`, confirm-bar copy in `PositionSetManager.tsx`).
- `screener.buy` ("Buy — add to portfolio") is the only string anywhere that connects Screener to a portfolio, and it's correctly one-way (a transaction, not a scope claim) — worth keeping it that way explicitly if this area gets touched.

## Questions to Consider

- Is there an actual confusion event that prompted the naming question, or is this a preemptive tidiness pass? The terminology-drift fix (P2) may fully resolve the itch without touching "Portfolio" itself.
- Given residence is already global-not-scoped in storage while export implies otherwise, do you want that correctness gap fixed before any naming/scope decision — since it's a real bug, not a semantic one?
- If Alex's real use case is "one account per portfolio," is the deeper need a proper multi-account model inside one portfolio, rather than a rename of the portfolio concept itself?

## Run Notes

- Target slug: `src-components-management-positionsetmanager-tsx` — resolved cleanly
- Ignore list: none (`.impeccable/critique/ignore.md` absent)
- Assessment independence: dual-agent, isolated (neither saw the other's output)
- CLI detector: clean, `[]`/exit 0 across all 4 targeted files
- Browser visibility: fresh tab opened on a separate dev-server instance (port 62071); primary evidence via `read_page`/`get_page_text` after most screenshots failed ("pane not displayed" in the sub-agent's context) — explicit fallback, not a silent skip
- Overlay injection: skipped by design choice (naming question, not a pixel-defect hunt) — no `[Human]`-tab overlay exists
- Portfolio-switch before/after on Screener: could not be tested live (only one portfolio exists in this environment, and creating a second required a form submission the sub-agent correctly declined without explicit user confirmation) — compensated with direct source evidence (global, unkeyed `screener:state` key; `handleExport` never references it)
- Live server cleanup: the redundant instance (port 62071) stopped and confirmed after synthesis; the project's own pre-existing dev server (port 3000) was left untouched
