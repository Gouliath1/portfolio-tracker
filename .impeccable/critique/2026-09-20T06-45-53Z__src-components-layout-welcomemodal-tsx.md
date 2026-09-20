---
target: welcome/onboarding popup (WelcomeModal.tsx)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/Users/goul/Development/portfolio-tracker/src/components/layout/WelcomeModal.tsx"
target_fingerprint: "sha256:f49f1e8a50e98366cc6c6e20bf094a9b746eaf75f29900a266f7fff94bbe6c0e"
target_path: /Users/goul/Development/portfolio-tracker/src/components/layout/WelcomeModal.tsx
timestamp: 2026-09-20T06-45-53Z
slug: src-components-layout-welcomemodal-tsx
---
Method: dual-agent (A: design-review sub-agent · B: detector/browser-evidence sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Clear demo-data banner state; nothing async here to signal |
| 2 | Match Between System & Real World | 4 | Plain language throughout, no jargon |
| 3 | User Control and Freedom | 2 | Dismiss and "Continue with demo" both exit cleanly, but there's no way back to this guidance later if dismissed before deciding |
| 4 | Consistency and Standards | 2 | The info card looks like a static panel elsewhere in the app, but here sits directly on top of a button restating its own headline — breaks the implicit "cards inform, buttons act" split |
| 5 | Error Prevention | 3 | No destructive actions in this view |
| 6 | Recognition Rather Than Recall | 3 | Icon+label pairing helps, undercut by the duplication below |
| 7 | Flexibility and Efficiency of Use | 2 | Costs a first-timer a genuine "did I already click that?" beat |
| 8 | Aesthetic and Minimalist Design | 2 | The redundant card is the clearest violation of the product's own Principle 1 ("every element earns its place") — this one doesn't |
| 9 | Error Recovery | 3 | N/A mostly; no error states possible here |
| 10 | Help and Documentation | 3 | Local-data note and import link answer the two likely questions |
| **Total** | | **27/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment**: Specific, not generic. The card/token system (indigo-tinted neutrals, `--glass-bg` rendering as a flat oklch fill with only a border-tone shift, no blur) is bespoke, and the copy ("Enter a ticker, quantity and cost — it takes about a minute") is concrete to this product rather than boilerplate onboarding text. The round-1 glassmorphism and broken-CTA fixes verified live and hold under inspection in both themes and both languages — genuinely fixed, not relabeled.

**Deterministic scan**: CLI static detector: clean, `[]`/exit 0. Live browser detector on the full rendered page: 24 raw findings, but DOM-containment check shows **0 of 24** are actually inside the modal — all 24 belong to dashboard content visible behind the dimmed backdrop (low-contrast P&L figures, undersized chart labels, body-text overflow on screener cards) or to `body` page-wide. The modal itself is mechanically clean. This confirms round 1's fixes (no blur, single elevation) didn't just move the problem — they removed it.

Where the two assessments align: neither found a **new** styling regression. The only substantive issue both surfaced independently is structural/IA (the card+button duplication), not visual — which matches: a detector scans CSS/DOM patterns, not redundant-meaning content, so its clean scan and the LLM's content-level finding aren't in tension, they're covering different layers.

## Overall Impression

Round 1's fixes hold up under live re-inspection — no jargon, no glassmorphism, no broken links, mechanically clean per the detector. The new issue is self-inflicted by round 1's own layout choice: keeping the descriptive "info card" pattern from the original two-path design, now wrapped around a single action, means the card states the action once and the button states it again immediately below. The product owner's complaint ("2 times the button 'Add position'") is accurate to what's on screen, not a subjective read — the card is bordered, padded, and icon-bearing in a way that reads as an inert twin of the real button.

## What's Working

- Manual "Add position" is genuinely the lead path now — no file, no schema, matches how a first-timer actually wants to start.
- Opaque, single-elevation surfaces hold throughout, including the card itself, verified in light/dark/French.
- Copy is calibrated to the brand voice — measured, accurate time estimate, no false urgency.

## Priority Issues

**[P1] The info card and the "Add position" button restate the same instruction and should collapse into one element.**
Why it matters: verified live in light/dark/French — DOM evidence confirms the card ("Add your first position" + description, 382×88px) sits 41px above the button ("Add position →", 382×42px), same width, same horizontal position, clearly one visual group. The card's only non-duplicate content is a single clause ("it takes about a minute"); everything else — the add-semantics icon, the "add position" headline — repeats what the button already says. A first-time reader can't immediately tell the card is inert and only the button below is clickable.
Fix: Drop the card. Move "Enter a ticker, quantity and cost — it takes about a minute" to sit as plain text above the button row (not boxed), or as small subtext inside/under the button itself. Removes one full layer of chrome (border, padding, icon-in-a-circle) and leaves exactly one visual target for the primary action.

**[P2] No `role="dialog"` / `aria-modal` / focus trap — background stays keyboard-reachable while the modal is open.**
Why it matters: confirmed via accessibility tree — the modal renders as plain `heading`/`generic`/`button` nodes with no dialog role, unlike the app's own Settings panel two clicks away (`dialog "Settings"`). Every dimmed background control (nav items, Settings gear, chart timeframe buttons, info buttons) remains live and tabbable while the modal sits on top; nothing announces "dialog" to a screen reader on open.
Fix: Add `role="dialog"` `aria-modal="true"` `aria-labelledby` (pointing at the h2) to the modal container, and trap Tab/Shift+Tab within it — return focus to the close control on wrap, restore focus to the trigger on close.

**[P3] French primary button wraps to two lines while its sibling stays on one, breaking the button row's equal height.**
Why it matters: "Ajouter une position →" wraps inside the accent button while "Continuer avec la démo" doesn't, so the two side-by-side buttons on the modal's most important row end up visibly different heights — in the app's second supported language, on its first screen.
Fix: Either stretch both buttons to a shared min-height regardless of wrap, or shorten the French string (e.g. "Ajouter" alone, context already establishes "position").

**[P3] Icon language would go inconsistent if the card is removed without carrying its icon forward.**
Why it matters: the card uses `MdAddCircle`; the button currently only has a trailing `MdArrowForward`. If P1's fix drops the card wholesale, the add-glyph disappears from the flow entirely.
Fix: If merging per P1, keep a single leading `MdAddCircle` (or deliberately none) on the resulting single control rather than losing it silently.

## Persona Red Flags

**Jordan (first-timer)**: hits the card→button redundancy first, before anything else — it's the first thing below the title. Best case: a half-second "which one do I click" hesitation. Worst case: reads the bordered, icon-bearing card as if it were already an action taken, and either double-clicks the real button out of doubt, or bails sideways into "Continue with the demo" to avoid the ambiguity — undermining round 1's whole point of making manual entry the confident default.

## Minor Observations

- The card's icon-in-a-tinted-circle is nearly the same visual weight as the header's app-icon square directly above it — two accent-tinted rounded chips stacked in a 400px modal reads as repetitive independent of the P1 fix.
- Footnote ("Your data is stored locally...") sits close to the import link with only a thin top border for separation — could use 2-4px more breathing room now that the modal trims vertical space elsewhere.
- Verify `welcome.subtitleBefore`'s apostrophe style is consistent with the rest of `en.ts` (curly vs straight).

## Questions to Consider

- If the card is removed, does the icon-in-a-circle motif still earn its place at all, or is the app's own header logo (already shown top-left) sufficient brand presence for a 400px dialog?
- Round 1 wanted manual entry to be *the* lead path — is giving "Continue with the demo" equal same-row, same-size visual weight next to "Add position" now pulling back toward a coin-flip between two options, when the point was a clear default?
- Should this modal be reachable again later (e.g. from Settings) for a Jordan who dismisses before deciding, given there's currently no path back to it?

## Run Notes

- Target slug: `src-components-layout-welcomemodal-tsx` — resolved cleanly (round 2, same target as round 1)
- Ignore list: none
- Assessment independence: dual-agent, isolated
- CLI detector: clean, `[]`/exit 0
- Browser visibility: live tab opened, first-run state reproduced, light/dark/French all checked across the two assessments
- Overlay injection: succeeded; 24 raw live findings, all 24 filtered out as outside the modal DOM subtree (0 genuine) — confirms round 1's fixes didn't just relocate the problem
- Live server cleanup: stopped and confirmed via `lsof` (same cosmetic script-tag-removal warning as round 1, no impact — tab was closed immediately after)
- Temp-file cleanup: none required
