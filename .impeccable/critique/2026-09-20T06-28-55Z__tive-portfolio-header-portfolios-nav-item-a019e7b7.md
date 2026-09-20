---
target: sidebar active-portfolio header + Portfolios nav item
total_score: 11
max_score: 28
na_heuristics: 5,9,10
p0_count: 0
p1_count: 1
target_identity: "file:/Users/goul/Development/portfolio-tracker/src/components/layout/AppSidebar.tsx (active portfolio header + Portfolios nav item)"
timestamp: 2026-09-20T06-28-55Z
slug: tive-portfolio-header-portfolios-nav-item-a019e7b7
---
## Design Health Score — sidebar portfolio-identity area

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Static block gives no signal it's current vs. just a label |
| 2 | Match System / Real World | 3 | "Portfolio" concept reads fine, no jargon |
| 3 | User Control and Freedom | 1 | No action available from the identity block; user must hunt for "Portfolios" lower down |
| 4 | Consistency and Standards | 1 | Same wallet icon + accent color used for a non-interactive `<div>` and an interactive `<button>` |
| 5 | Error Prevention | n/a | No input/action here to err on |
| 6 | Recognition Rather Than Recall | 1 | Must remember "Portfolios" lives elsewhere; header gives no affordance hint |
| 7 | Flexibility and Efficiency | 1 | Frequent portfolio-switchers get no shortcut from the most visible spot |
| 8 | Aesthetic and Minimalist Design | 2 | Two portfolio-labeled elements for one concept is redundant |
| 9 | Error Recovery | n/a | No error state applicable |
| 10 | Help and Documentation | n/a | Not applicable to a static label |
| **Total** | | **11/28** | **Poor (39%)** |

## Design Specificity Verdict

**LLM assessment**: This is generic SaaS-shell boilerplate (logo → identity chip → nav list) — nothing about the icon, the eyebrow-label pattern, or the nav row is specific to a "precise, measured, quiet" personal finance tool. It's the part of the sidebar most likely to look identical in an unrelated product.

**Deterministic scan**: File-scoped `impeccable detect` on AppSidebar.tsx came back clean (exit 0, no findings) — the AST scanner doesn't catch cross-element consistency problems like this. The live-page browser scan (whole app, not sidebar-scoped) found 14 anti-patterns, one of which lands directly in this file: `undersized-ui-text` — the "PORTFOLIO" eyebrow label renders at 10px (`text-[10px]`, AppSidebar.tsx:80-83), below the 11px legibility floor. Traced and confirmed as a true positive. The other 13 findings (low-contrast captions, undersized chart labels, edge-flush cards) are all in main-content components, out of scope for this target.

**Visual overlays**: Injection succeeded but the console-tagged overlay data wasn't a user-visible highlight in the user's own browser (the sub-agent ran it in its own isolated tab, then tore the live-server down per protocol) — the finding above is reported from its console capture, not a live overlay left open.

## Overall Impression

Two elements — a static "PORTFOLIO / my-portfolio" identity block and a separate, plural "Portfolios" nav button four rows down — represent the same underlying concept (which portfolio, and switching it) but only one of them is clickable, and both use the same wallet icon and accent color. Nothing in the visual language tells a user which one is real. The single biggest opportunity: collapse them into one component, styled and behaved like the rest of the nav.

## What's Working

- Truncation with a `title` tooltip on long portfolio names is a considerate, low-key touch.
- Restrained uppercase eyebrow label fits the brand's quiet register (once resized).
- Clear border-delineated sections (logo / identity / nav / footer) give the sidebar calm rhythm.

## Priority Issues

**[P1] Static "PORTFOLIO" block and clickable "Portfolios" nav button both claim the same concept, with identical iconography and color, but only one is interactive.**
- **Why it matters**: Directly causes the confusion flagged. Violates consistency (icon+accent normally means "clickable" everywhere else in this nav) and forces users to recall that switching lives in a different spot than where the current name is shown.
- **Fix**: Merge into one clickable component. Turn the "Active portfolio" block itself into the nav entry: make it a `<button>` that navigates to `?view=data`, delete the separate `VIEW_ITEMS`/"Portfolios" row entirely (AppSidebar.tsx:38-40, :164). Keep the wallet icon and the two-line (label + name) layout since it's more informative than a plain nav row; add `hover:opacity-80` and `activeStyle` (accent-dim background) when `activeView === 'data'`, matching the rest of the nav. A small swap-arrow glyph at the trailing edge (reuse the arrows already in `PortfoliosIcon`) signals "click to switch" without needing new iconography.
- **Suggested command**: `$impeccable layout`

**[P2] "PORTFOLIO" eyebrow label renders at 10px, below the 11px legibility floor.**
- **Why it matters**: Confirmed by the detector as a true positive; small, low-contrast-adjacent text is exactly the kind of thing that erodes trust in a tool checked daily.
- **Fix**: Bump `text-[10px]` to at least `text-[11px]` on AppSidebar.tsx:80. Cheap to fold into the same edit as P1.
- **Suggested command**: `$impeccable typeset`

**[P3] Terminology mismatch: singular "PORTFOLIO" vs. plural "Portfolios."**
- **Why it matters**: Minor, but compounds the sense that these are two different things rather than one.
- **Fix**: Once merged, settle on one framing — likely keep "PORTFOLIO" (singular, current-state) as the eyebrow since the value line already shows the specific name; drop "Portfolios" as a separate label.
- **Suggested command**: `$impeccable clarify`

**[P3] Wasted nav density.**
- **Why it matters**: The merge frees a full row in a nav list that already stacks five items (Overview/Analysis/Assets/Screener/Taxes) before this one — improves the "density with rhythm" principle.
- **Fix**: Falls out naturally from the P1 fix (deleting `VIEW_ITEMS`).
- **Suggested command**: (covered by P1)

## Persona Red Flags

**Alex (Power User, switches portfolios often)**: Has to scan past 4-5 nav rows to reach "Portfolios," when the thing already in view — the current portfolio name at the top — is inert. Adds friction to what's likely a frequent action for a multi-portfolio user.

**Jordan (First-Timer)**: Most prominent portfolio-related UI is the static block; a first-timer will likely click it expecting a switcher, get nothing, and may never discover the real entry point lower in the list.

## Minor Observations

- Neither element currently sets an explicit `cursor: pointer` / `cursor: default` distinction beyond native button defaults — worth double-checking after the merge that the new clickable header actually shows a pointer cursor.
- The identity block's `border-bottom` currently reads as a section divider (implying "this ends here, non-interactive"); re-tune the border treatment once it becomes a button so it doesn't look like a static header with a nav item's behavior bolted on.

## Questions to Consider

- Once merged, should clicking it navigate straight to the full management panel (`?view=data`), or open a lightweight inline dropdown for quick-switching, with "manage all portfolios" as a secondary action inside it?
- Does "PORTFOLIO" (singular, current-state framing) or "Portfolios" (plural, management framing) better describe what happens when you click?
