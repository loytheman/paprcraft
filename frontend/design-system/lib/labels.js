// Label colours. Keep the keys in step with labelColors in backend/api/src/models/model.label.js.
// Deliberately none of the status colours (green up, amber slow/regional, red down), so a label
// never reads as a monitor's state.
export const LABEL_COLORS = {
  cyan: '#22d3ee',
  blue: '#60a5fa',
  indigo: '#818cf8',
  violet: '#a78bfa',
  fuchsia: '#e879f9',
  pink: '#f472b6',
  slate: '#94a3b8',
  stone: '#d6d3d1',
};

export const labelColorNames = Object.keys(LABEL_COLORS);

// Inline style for a chip in this colour: tinted fill, stronger border, full-strength text.
export const labelStyle = (color) => {
  const hex = LABEL_COLORS[color] ?? LABEL_COLORS.slate;
  return { color: hex, backgroundColor: `${hex}1f`, borderColor: `${hex}66` };
};
