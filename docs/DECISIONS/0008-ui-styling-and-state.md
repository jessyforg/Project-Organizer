# ADR-0008: UI styling, data loading, and visual identity

- Status: Approved (decided within the product owner's delegated authority for Phase 4); the visual layer is refined by [ADR-0011](0011-interface-refresh.md)
- Date: 2026-10-17

## Context

Phase 4 builds the interface. The architecture sketch mentioned Tailwind and a query-caching library. The app has a strict Content Security Policy (no inline styles in markup, no remote fonts), must work offline, and must stay maintainable by one developer.

## Decisions

### Styling: plain CSS with design tokens (instead of Tailwind)

- Tokens (colour, type scale, spacing, radii) are CSS custom properties in `src/renderer/styles/tokens.css`, with light and dark sets switched by `data-theme` or the system setting.
- A handful of global stylesheets (`base`, `controls`, `layout`, `tasks`) with plain class names.
- Rationale: no build plugin or extra dependency; styles are readable without learning a utility vocabulary; tokens give one place to change the look. Tailwind remains an option if the stylesheet grows unwieldy.
- Layout responds to the main area's width with container queries, so it adapts when the task details panel opens.

### Data loading: invalidate-and-reload (instead of a caching library)

- `useQuery(key, load)` loads through `window.api`; any successful change calls `invalidate()`, which reloads every visible query.
- Rationale: IPC is local and fast; reloading avoids stale-cache bugs and a dependency. Revisit if profiling shows excessive reloads.
- Controls that the user toggles (completion checkbox, theme) show the new value immediately and keep it until the reloaded data catches up, reverting only on failure. This was added after end-to-end tests caught a brief flicker back to the old value.

### Navigation: in-memory route state (no router library)

Routes are a small typed union in React state. The app has no URLs to deep-link to, so a router adds nothing.

### Visual identity

- Typeface: Atkinson Hyperlegible Next (SIL Open Font License), bundled locally. It was designed for legibility, which suits the accessibility requirements.
- Palette: cool steel neutrals with "temper blue" for actions and focus.
- One expressive element: priority shown as a four-step "heat" pip (cherry red, orange, straw, cool steel), always next to its text label so colour is never the only signal.
- Text colours were checked against WCAG AA (4.5:1) on every background they appear on, including the selected-row background.

### New dependencies (devDependencies, bundled into the renderer)

| Package | Licence | Purpose |
|---|---|---|
| lucide-react 1.51.0 | ISC | Icons |
| @fontsource/atkinson-hyperlegible-next 5.3.0 | OFL-1.1 | Local font files |
| @testing-library/react, dom, user-event, jest-dom; jsdom | MIT | Component tests |

None has an install script.
