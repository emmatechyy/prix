# Frontend spec: acceptance checklist (§10) on branch `frontend-spec`

Checked on 2026-11-14 against a local production build (`pnpm build && pnpm start`) and the Vercel preview
`https://prix-git-frontend-spec-emmareal1110-2553.vercel.app` (Vercel Authentication on). Screenshots: `screenshots/frontend-spec/`.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Four nav items on every page; old routes 308; numbered chips gone | Pass | `nav[aria-label=Primary]` = Verdicts, Tokens, Capital, Method on every page (top bar ≥ 900px, bottom tabs below). `/rankings /thesis /flows /whales /launches /methodology /depth` all return 308 to the spec targets (local and preview). `KeyChip` removed. |
| 2 | Homepage answers “what does PRIX conclude?” in the first 360px screen | Pass | `verdicts-first-screen-360.png`: title, “3 mixed, 1 not supported, 2 not enough data”, the six-segment bar and the freshness line are above the fold. |
| 3 | Every claim has a rail with a text equivalent; “Not enough data yet” shows coverage | Pass | `role="img"` + `aria-label` sentence + visible caption on all six. H2 and H5 show coverage bars (“Needs 30 days of data; has 2 (7%)”, “Needs 80% of both the 7- and 30-day windows observed; has 0.5%”). |
| 4 | Verdicts never by colour alone (grayscale, colour-blind) | Pass | Badge = icon + word + coloured border; zones = tint + solid/dashed/dotted edge; marker carries the verdict icon. `verdicts-grayscale-1280.png`, `verdicts-deuteranopia-1280.png`. |
| 5 | axe and Lighthouse a11y 95+; full keyboard path | Pass (automated) | axe (wcag2a/aa, 21a/aa, all `<details>` opened): 0 violations on `/`, `/method`, `/tokens` (all views), `/capital`, `/token/…`, light and dark. Lighthouse a11y 100 on `/`, `/method`, `/tokens`, `/capital`. Keyboard: nav links, segmented controls, claim summaries, evidence copy buttons, depth cells (`<details>`), scroll regions (`tabIndex=0`) all reachable; manual screen-reader pass not done. |
| 6 | 360 / 768 / 1280, light and dark; no page h-scroll; wide tables scroll in their container | Pass | Script check `scrollWidth == viewport` for all four pages at 360/768/1280 light, and dark at 360/1280. |
| 7 | No text < 13px; no line > ~68ch; touch targets ≥ 44px | Pass (automated) | Script check: no rendered text node under 13px and no interactive element under 44×44 (outside inline links in running text) on all pages/widths. Reading text uses `.measure` (68ch). |
| 8 | `prefers-reduced-motion`; only the rail entrance animation | Pass | One `@keyframes` (`rail-in`, 600ms ease-out); the global reduced-motion rule disables it. Old blur-up “appear” animation removed. |
| 9 | Every number has a source link; every chart has a table view | Partial | Claims: per-row source links + snapshot hash + verify command. Key numbers, integrity, depth, token cost chart: source icons/links. All SVG charts have “View as table” + JSON download. Some legacy live tables (whales/launches, flow detail) cite sources in a footer line per table rather than per number. |
| 10 | Performance budgets; no layout shift on hydration | Pass (lab) | Lighthouse mobile (local prod): `/` perf 99, LCP 0.9s, CLS 0; `/method` 100; `/tokens` 100; `/capital` 96, LCP 1.1s, CLS 0. First-load JS ≈ 143 KB transferred per route (budget 150 KB). `lightweight-charts` removed; charts are server-rendered SVG. Live-data blocks stream behind `<Suspense>` so first byte is not held by upstream APIs. |
| 11 | Copy follows the terms table; no raw error codes | Pass | `plain()` + `flagText()` apply the terms table; statuses read “No route”, “Quote failed”, “Paused”, “Rate-limited”; `SourceError` no longer prints upstream messages; error page has no digest. Raw rule strings are shown only where quoted verbatim from `thresholds/v1.yaml`. |
| 12 | Screenshots at 360 and 1280 attached to the PR | Not done | Screenshots are committed under `screenshots/frontend-spec/`; no PR was opened (not authorised). |

Not changed: `thresholds/v1.yaml` (still DRAFT, not locked), the verdict engine, snapshot data, API envelopes.
