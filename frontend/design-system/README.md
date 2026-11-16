# paprcraft design system

Shared tokens and Vue components for the paprcraft frontends, built on Tailwind CSS v4. Visual
direction: "Obsidian Telemetry" (dark canvas `#090d16`, accent `#00f0ff`), inherited from the
reference project (othpulse). Re-skin it in `theme.css` when paprcraft gets its own look.

Preview every token and component in dev: `cd frontend/landing && yarn dev`, then open
`https://localhost:6200/design-system.html`.

## Using it in an app

```css
/* src/style.css */
@import "tailwindcss";
@import "../../design-system/theme.css";
@source "../../design-system";
```

```js
// vite.config.js
resolve: {
  alias: { '@ds': fileURLToPath(new URL('../design-system', import.meta.url)) },
  dedupe: ['vue'], // this folder has no node_modules of its own
},
server: { fs: { allow: ['..'] } },
```

Load the fonts in `index.html`: Geist (400, 500, 600) and JetBrains Mono (400, 500, 600) from Google Fonts.

## Tokens (`theme.css`)

`theme.css` resets Tailwind's default palette, so only these colours exist.

| Group | Utilities | Use |
| --- | --- | --- |
| Surfaces | `bg-canvas`, `bg-sunken`, `bg-surface-1/2/3`, `bg-surface-hover` | Page → section → card → overlay. `sunken` for inputs and code wells. |
| Lines | `border-line-faint/soft/line/strong` | Always white at low alpha, never solid grey. |
| Text | `text-ink`, `text-ink-muted`, `text-ink-faint`, `text-ink-inverse` | Body, secondary, captions; inverse sits on cyan. |
| Accents | `cyan`, `cyan-dim`, `cyan-soft`, `violet`, `violet-soft` | Cyan = live signal and primary action. Violet = secondary, tags. |
| Status | `ok`, `warn`, `down` (+ `-soft`) | The only colours that mean up / degraded / down. |
| Status tints | `status-ok`, `status-warn`, `status-down`, `status-info` | Text + 8-12% fill + border in one class. Add `border`. |
| Type | `text-display`, `text-h1/h2/h3`, `text-body-lg`, `text-body`, `text-small`, `text-label` | Sizes carry their own line height, tracking and weight. |
| Fonts | `font-sans` (Geist), `font-mono` (JetBrains Mono) | Mono for numbers, status codes, URLs, region codes and labels. Mono is always tabular. |
| Radii | `rounded-control` (4), `rounded-card` (8), `rounded-sheet` (12) | Controls / cards / sheets and large panels. |
| Depth | `shadow-rim`, `shadow-glow`, `shadow-glow-sm`, `shadow-down` | Rim glows instead of drop shadows. |
| Motion | `animate-live`, `animate-trace` | Live-dot ping, moving pulse trace. Off under reduced motion. |
| Other | `eyebrow` | Mono uppercase cyan label above section headings. |

## Rules

- Dark only. Body sets `color-scheme: dark`.
- Fully rounded shapes only for status badges and live dots.
- Status colours only for status. Decoration uses cyan or violet.
- One `shadow-glow` element per view (the main call to action).
- Icons are inline SVG via `OpIcon`; add new ones to its `icons` map (24 grid, 1.75 stroke).

## Components (`components/`)

| Component | Props |
| --- | --- |
| `OpButton` | `variant` primary/secondary/ghost/destructive, `size` sm/md/lg, `href` (renders `<a>`), `icon`, `iconRight`, `block` |
| `OpIcon` | `name`, `size`, `label` (omit for decorative) |
| `OpStatusBadge` | `status` ok/warn/down/info, `live` |
| `OpLogo` | `size`, `wordmark` (placeholder mark until the real logo exists) |
| `OpConfirmDialog` | `open`, `title`, `message`, `confirmLabel`, `cancelLabel`, `icon`, `tone` destructive/primary; emits `confirm`, `cancel`. Confirmation on the native `<dialog>`, Cancel focused first |
| `OpLabel` | `name`, `color` (a key of `lib/labels.js`). Label chip; default slot for an icon |
| `OpTextarea` | `v-model`, `label`, `hint`, `error`, `placeholder`, `rows`, `maxlength`. Multi-line `OpInput` |
| `OpSkeleton` | None. A pulsing placeholder block sized by the caller's classes; respects reduced motion |
| `OpGoogleButton` | `href` (the API's `/auth/google/start`), `label`, `size` sm/md/lg, `block`. Google's own white button style — the one allowed off-palette colour. Spinner + "Redirecting…" after click |
| `OpCheckbox` | `v-model` Boolean, `label` (or the default slot for longer text), `error`, `disabled` |
| `OpRadio` | `v-model` (the selected `value`), `value`, `label`, `name`. One radio; use several with the same `name` |
| `FormRenderer` | A dynamic form from its schema (`lib/forms.js` documents the schema). Props: `schema`, `v-model` (values), `errors` (the API's `[{ key, message, row?, field? }]`), `readonly`, `audience` account/public (public hides `internal` fields), `v-model:attachments` (`[{ id?, key?, name, size?, fieldKey }]`), `uploader(file, fieldKey) -> { key, name }`, `consentText`. Every field type, groups of rows, live `visibleIf`. `scrollToFirstError()` is exposed. `FormField` is its per-field part |

## Helpers (`lib/`)

- `forms.js`: the form engine (schema checks, `evalCond`, `normalizeValues`, `flatten`), a byte-for-byte copy of `backend/api/src/helpers/formEngine.js`. Don't edit it here: change the API file, copy it over, and run `yarn test` in `frontend/dashboard` (it checks the copy and runs the shared vectors).
- `forms-ui.js`: helpers for `FormRenderer` (file rules, error lookup, readonly text).
- `countries.js`: `COUNTRIES` (ISO 3166-1 alpha-2 code + name) and `countryName(code)`.
- `labels.js`: `LABEL_COLORS`, `labelColorNames`, `labelStyle(color)`. Eight label colours, none of them a status colour.

## Dashboard (later)

The dashboard is on PrimeVue 3. When it moves to PrimeVue 5 + Tailwind, point a
`definePreset(Aura, …)` preset's primary and surface colours at these CSS variables and add the
`tailwindcss-primeui` plugin, so PrimeVue components and these utilities share one palette.
