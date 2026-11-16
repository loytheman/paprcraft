// Label colours. The colour values are constants in design-system/tokens.css (--label-*); this file only
// names them. Keep the keys in step with labelColors in backend/api/src/models/model.label.js.
// Deliberately none of the status colours (mint up, lemon slow, red down), so a label never reads as a state.
export const LABEL_COLORS = {
  cyan: 'var(--label-cyan)',
  blue: 'var(--label-blue)',
  indigo: 'var(--label-indigo)',
  violet: 'var(--label-violet)',
  fuchsia: 'var(--label-fuchsia)',
  pink: 'var(--label-pink)',
  slate: 'var(--label-slate)',
  stone: 'var(--label-stone)',
};

export const labelColorNames = Object.keys(LABEL_COLORS);

// Inline style for a chip in this colour: tinted fill, stronger border, full-strength text.
export const labelStyle = (color) => {
  const c = LABEL_COLORS[color] ?? LABEL_COLORS.slate;
  return { color: c, backgroundColor: `color-mix(in srgb, ${c} 10%, transparent)`, borderColor: `color-mix(in srgb, ${c} 35%, transparent)` };
};
