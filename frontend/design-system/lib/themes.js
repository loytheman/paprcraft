// Colour themes the visitor can switch between (the floating ThemePicker). Each theme is five hex
// codes: [deep, main, light accent, yellow, light background]. applyTheme() derives every colour
// role from them and sets the roles as CSS variables on <html>, over the defaults in theme.css.
// "default" removes the overrides. The choice is kept in this browser only (localStorage).
// Add or edit a palette here; nothing else needs to change.

export const THEMES = [
  { id: 'default', name: 'Paprcraft', colors: ['#047857', '#059669', '#80ff00', '#ffff00', '#f8fafc'] },
  // The brand mark's own four facets: deep forest, radiant mint, citrus gold, peach.
  { id: 'prism', name: 'Prism (logo)', colors: ['#064E3B', '#047857', '#34D399', '#F59E0B', '#FFF7ED'] },
  { id: 'citrus-meadow', name: 'Citrus Meadow', colors: ['#2E7D32', '#7CB342', '#C0CA33', '#FDD835', '#FFF8E1'] },
  { id: 'lime-zest-minimal', name: 'Lime Zest Minimal', colors: ['#1B5E20', '#4CAF50', '#AEEA00', '#FFEB3B', '#FAFAFA'] },
  { id: 'matcha-lemonade', name: 'Matcha Lemonade', colors: ['#33691E', '#8BC34A', '#CDDC39', '#FFC107', '#FFFDE7'] },
  { id: 'spring-market', name: 'Spring Market', colors: ['#2F6B3C', '#66BB6A', '#D4E157', '#FFEE58', '#F5F5F0'] },
  { id: 'neon-pear-pop', name: 'Neon Pear Pop', colors: ['#0B3D02', '#39FF14', '#C6FF00', '#FFEA00', '#111111'] },
  { id: 'olive-sunlit', name: 'Olive Sunlit', colors: ['#3D5B2A', '#6B8E23', '#B5C547', '#E6D64A', '#F2EFE6'] },
  { id: 'avocado-citrus', name: 'Avocado Citrus', colors: ['#2E3A1F', '#568A3B', '#9CCC65', '#F9E547', '#FFF3C4'] },
  { id: 'golden-fern', name: 'Golden Fern', colors: ['#1F4D2E', '#4E8A5A', '#A3B84C', '#E3D36B', '#F7F6E7'] },
  { id: 'chartreuse-studio', name: 'Chartreuse Studio', colors: ['#0F3D1E', '#2E7D32', '#9ACD32', '#E8F04A', '#E0E0E0'] },
  { id: 'pineapple-sage', name: 'Pineapple Sage', colors: ['#355E3B', '#7BA05B', '#C9D36B', '#FFD54F', '#FFF9E5'] },
  { id: 'rainy-garden-glow', name: 'Rainy Garden Glow', colors: ['#2D6A4F', '#74C69D', '#B7E4C7', '#E9D66B', '#F8F4E3'] },
  { id: 'bamboo-lemon-ui', name: 'Bamboo Lemon UI', colors: ['#1F3B1F', '#3E8E41', '#A3D977', '#F2E94E', '#FFFFFF'] },
  { id: 'tropical-patio', name: 'Tropical Patio', colors: ['#2F4F2F', '#6BAF4E', '#BFE35A', '#FFE66D', '#FFF5D6'] },
  { id: 'harvest-lime', name: 'Harvest Lime', colors: ['#4A5D23', '#7C8F2B', '#B9C23F', '#F0D54E', '#F7F1D5'] },
  { id: 'electric-tennis-court', name: 'Electric Tennis Court', colors: ['#0B1F0E', '#1E7F2D', '#B7FF3C', '#FFE600', '#F3F3F3'] },
  { id: 'custom-fern', name: 'Custom Fern', colors: ['#1F4D2E', '#2E7D32', '#9ACD32', '#FDD835', '#FFF8E1'] },
  { id: 'custom-tennis-court', name: 'Custom Tennis Court', colors: ['#1F4D2E', '#1E7F2D', '#B7FF3C', '#FFE600', '#F3F3F3'] },
];

const KEY = 'paprcraft-theme';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
// mix(a, b, t): t of b into a
const mix = (a, b, t) => { const x = rgb(a); const y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
// Darken `h` until it reads on white (WCAG AA for small text).
const readable = (h) => { let c = h; for (let i = 0; i < 12 && contrast(c, '#ffffff') < 4.5; i += 1) c = mix(c, '#000000', 0.12); return c; };

export function rolesFor([deep, main, light, yellow, bg]) {
  const W = '#ffffff';
  const K = '#000000';
  const text = readable(deep);
  const onPrimary = contrast(main, W) >= 3.2 ? W : '#0f172a'; // white text only where the fill is dark enough
  const roles = {
    primary: main,
    'primary-hover': contrast(main, W) >= 3.2 ? mix(main, K, 0.12) : mix(main, W, 0.25),
    'primary-active': mix(main, K, 0.25),
    'primary-text': text,
    'primary-bright': light,
    'primary-soft': mix(main, W, 0.9),
    'primary-edge': mix(main, W, 0.65),
    'primary-ink': mix(text, K, 0.2),
    'on-primary': onPrimary,
    'accent-lime': light,
    'accent-lime-bright': mix(light, W, 0.3),
    secondary: mix(yellow, K, 0.4),
    'secondary-bright': yellow,
    'secondary-soft': mix(yellow, W, 0.88),
    'secondary-edge': mix(yellow, W, 0.65),
    'secondary-line': mix(yellow, W, 0.4),
    'secondary-ink': mix(yellow, K, 0.72),
    'secondary-text': mix(yellow, K, 0.62),
    ok: text,
    'ok-soft': light,
  };
  if (lum(bg) > 0.8) { roles.canvas = mix(bg, W, 0.55); roles.sunken = mix(bg, '#64748b', 0.1); } // a dark "background" swatch is ignored
  return { roles, glow: rgb(main).join(' ') };
}

export function applyTheme(id) {
  const el = document.documentElement;
  const t = THEMES.find((x) => x.id === id);
  for (const prop of [...el.style]) if (prop.startsWith('--color-') || prop === '--glow-color') el.style.removeProperty(prop);
  if (t && t.id !== 'default') {
    const { roles, glow } = rolesFor(t.colors);
    for (const [k, v] of Object.entries(roles)) el.style.setProperty(`--color-${k}`, v);
    el.style.setProperty('--glow-color', glow);
  }
  try { localStorage.setItem(KEY, t?.id ?? 'default'); } catch { /* private window: the theme just isn't remembered */ }
}

export const storedTheme = () => { try { return localStorage.getItem(KEY) || 'default'; } catch { return 'default'; } };
export const applyStoredTheme = () => { const id = storedTheme(); if (id !== 'default') applyTheme(id); return id; };
