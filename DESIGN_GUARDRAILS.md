# TSTS Frontend Design Guardrails

## CTA Hierarchy — Token Classes (defined in css/fonts.css)

| Token | Use Case | Appearance |
|---|---|---|
| `.tsts-btn-primary` | All action buttons (submit, CTA, confirm, retry) | Solid orange `rgb(194 65 12)` with white text |
| `.tsts-btn-secondary` | Secondary/navigation actions (copy link, manage prefs) | White bg, slate border, dark text |
| `.tsts-indicator-ink` | Interactive selection states ONLY (chips, tabs, toggles) | Dark ink `rgb(31 41 51)` with white text |
| `.tsts-surface-ink` | Structural dark backgrounds (cards, sections) — NOT interactive | Dark ink with light text |

## Invariants

1. **No raw `bg-tsts-ink`** on `<button>` or `<a>` elements. Use token classes instead.
2. **No `bg-white/10` or `bg-white/20`** anywhere in html/js. These produce unreadable overlays.
3. **No internal vocabulary** ("pillar", "framework", "engine", "architecture", "module", "layer") in user-facing HTML (excluding legal/admin).
4. **No `bg-orange-700` / `bg-orange-800`** directly on elements — use `.tsts-btn-primary` token.

## Grep Gates (CI/Pre-commit)

Run these before every frontend commit. All must return ZERO results.

```bash
# Gate 1: No raw bg-tsts-ink in html/js
rg "bg-tsts-ink" --glob "*.{html,js}" Shared-Story-frontend/

# Gate 2: No internal vocabulary (exclude admin, legal)
rg -i "(pillar|pillars|framework|engine|architecture|module|layer)" --glob "*.html" Shared-Story-frontend/ | rg -v "admin|terms|privacy|profile"

# Gate 3 (HARD ZERO): No low-opacity white overlays
rg "bg-white/(10|20)" --glob "*.{html,js}" Shared-Story-frontend/
```

## Brand Palette Reference

- **Primary CTA**: `rgb(194 65 12)` (orange-700) / hover `rgb(154 52 18)` (orange-800)
- **Ink**: `rgb(31 41 51)` — headings, indicators, surfaces
- **Cream**: `bg-tsts-cream` — page backgrounds
- **Cards**: `shadow-soft-card`, `rounded-3xl`, `border border-gray-100`
- **Inputs**: `border-slate-200`, `bg-gray-50`, `focus:ring-tsts-clay/60`
- **Headings**: `.heading-serif` (Playfair Display)
