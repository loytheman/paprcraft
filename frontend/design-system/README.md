# paprcraft design system

Shared tokens and Vue components for the paprcraft frontends, built on Tailwind CSS v4. Colours and shapes are constants in `tokens.css` (see below).

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

Load the fonts in `index.html`: Plus Jakarta Sans (400, 500, 600, 700) and JetBrains Mono (400, 500, 600) from Google Fonts.

## Colours are constants: `tokens.css`

All raw colour values live in **one file, `tokens.css`**, as `--palette-*` steps (slate, mint, lemon, sky, red), the label colours (`--label-*`) and shape/shadow constants. `theme.css` imports it and maps *roles* (`--color-primary`, `--color-ink`, ...) onto those steps. Components only ever use roles through Tailwind utilities (`bg-primary`, `text-ink`, `border-line`), so:

- **To change a colour**, edit one value in `tokens.css` (for example `--palette-green-600`).
- **To change which step a role uses**, edit that role in `theme.css`.
- No component, view or app stylesheet contains a hex colour. Exceptions that cannot use CSS variables: the static `favicon.svg` files, the Google logo, and the e-mail templates (`backend/api/src/emails/email.layout.js`, `BRAND`), which carry a copy of the brand values and say so.
- `landing/design-system.html` (dev only: `cd frontend/landing && yarn dev`) shows every palette step and role with the live value read from the CSS, so it cannot drift.

Look: "Paprcraft System" (Precision Modernism): light slate canvas, Fresh Mint primary, Sunny Lemon accents, sky tertiary, hairline borders, tinted shadows.

## Tokens (`theme.css`)

`theme.css` resets Tailwind's default palette (and keeps every role available with `@theme static`), so only these colours exist.

| Group | Utilities | Use |
| --- | --- | --- |
| Surfaces | `bg-canvas`, `bg-sunken`, `bg-surface-1/2/3`, `bg-surface-hover` | Page (slate-50) → white panels and cards → tinted wells. Inputs and dialogs are `surface-1` (white). |
| Lines | `border-line-faint/soft/line/strong` | Slate hairlines: `line` for cards, `line-strong` for inputs and popovers. |
| Text | `text-ink`, `text-ink-muted`, `text-ink-faint`, `text-ink-disabled`, `text-ink-inverse` | Body, secondary, captions, placeholders/disabled; inverse sits on mint. `ink-faint` is slate-500 (readable); the spec's slate-400 is `ink-disabled`. |
| Primary (mint) | `primary`, `primary-hover`, `primary-active`, `primary-text`, `primary-bright`, `primary-soft`, `primary-edge`, `primary-ink` | Actions, success, focus. Use `primary-text` for small text and links (darker for contrast). |
| Secondary (lemon) | `secondary`, `secondary-bright`, `secondary-soft`, `secondary-edge`, `secondary-line`, `secondary-ink`, `secondary-text` | Notices, tags, versions. Never a primary button. |
| Tertiary (sky) | `tertiary`, `tertiary-soft`, `tertiary-edge`, `tertiary-ink` | Links, metadata, information. |
| Status | `ok`, `warn`, `down` (+ `-soft`, `down-bg/edge/ink`) | The only colours that mean up / degraded / down. |
| Chips | `status-ok`, `status-warn`, `status-down`, `status-info`, `status-neutral` | Text + tint + border in one class. Add `border rounded-full`. |
| Code | `bg-code`, `text-code-ink` | Dark slate wells for snippets, with mint and lemon highlights. |
| Type | `text-display`, `text-h1/h2/h3`, `text-body-lg`, `text-body`, `text-small`, `text-label` | Sizes carry their own line height, tracking and weight (display 40/700, h1 32/600, h2 22, h3 18, body 14, label 11/600). |
| Fonts | `font-sans` (Plus Jakarta Sans), `font-mono` (JetBrains Mono) | Mono for code, ids and timestamps only. Mono is always tabular. |
| Radii | `rounded-control` (8), `rounded-card` (16), `rounded-sheet` (24), `rounded-full` | Controls / cards / sheets. Pills only for chips, tags and badges. |
| Depth | `shadow-rim`, `shadow-pop`, `shadow-modal`, `shadow-lift`, `shadow-glow`, `shadow-glow-sm`, `shadow-ring`, `shadow-down` | Level 1 cards use a hairline; pop = menus, modal = dialogs, glow = the main mint action. |
| Motion | `animate-live`, `animate-trace` | Live-dot ping. Off under reduced motion. |
| Other | `eyebrow` | Small uppercase mint label above section headings. |

## Rules

- Light only. Body sets `color-scheme: light`.
- Fully rounded shapes only for chips, tags and live dots.
- Status colours only for status. Lemon is a disciplined accent (tags, notices), never a primary button.
- One `shadow-glow` element per view (the main call to action).
- Text controls get one shared focus ring (mint border plus a soft halo), set globally in `theme.css`.
- Icons are inline SVG via `OpIcon`; add new ones to its `icons` map (24 grid, 1.75 stroke).

## Components (`components/`)

| Component | Props |
| --- | --- |
| `OpButton` | `variant` primary/secondary/ghost/accent/destructive, `size` sm/md/lg, `href` (renders `<a>`), `icon`, `iconRight`, `block` |
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
