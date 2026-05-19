---
target: table action icons (delete + sell)
total_score: 20
p0_count: 1
p1_count: 2
timestamp: 2026-05-19T13-32-58Z
slug: onents-tables-positionstable-columndefinitions-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Actions exist at 30% opacity — functionally invisible until hover |
| 2 | Match System / Real World | 1 | MdRemoveCircleOutline reads as "remove/delete," not "sell a financial position" |
| 3 | User Control and Freedom | 3 | Undo toast for delete, modal for sell — recovery exists |
| 4 | Consistency and Standards | 2 | No title on delete, title on sell. Delete column left of sell. Header icon sizes differ |
| 5 | Error Prevention | 2 | Delete is one tap → undo toast (5s). No pre-confirmation for an irreversible action |
| 6 | Recognition Rather Than Recall | 1 | Icon-only, near-identical icons, no labels |
| 7 | Flexibility and Efficiency | 3 | Mouse-accessible; tab-focusable |
| 8 | Aesthetic and Minimalist Design | 2 | Opacity-30 achieves table cleanliness at the cost of making the feature unfindable |
| 9 | Error Recovery | 3 | Undo toast + sell modal |
| 10 | Help and Documentation | 1 | No visible tooltip on delete. Header is a faint icon |
| **Total** | | **20/40** | Below average |

## Priority Issues

P0: Sell icon (MdRemoveCircleOutline) doesn't mean "sell" — indistinguishable from delete at 30% opacity
P1: Opacity 30% default makes actions invisible; broken on touch
P1: Hit target 23x23px — too small for destructive financial actions
P2: Delete column left of sell (most destructive action first, reads wrong)
P2: Delete missing title tooltip (sell has it, delete doesn't)
