// Clickable list rows: a click anywhere on the row opens it, except on its own controls (links,
// buttons, inputs, the 3-dot menu) or while the user is selecting text. The row's name stays a real
// link, so keyboard and screen-reader users open it the usual way.
//
//   <li :class="ROW_CLICKABLE" @click="onRow($event, () => open(t))">
export const ROW_CLICKABLE = 'cursor-pointer transition-colors hover:bg-ink/3 first:rounded-t-sheet last:rounded-b-sheet';

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="menu"], [role="menuitem"], [contenteditable="true"]';

export const onRow = (event, open) => {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.target.closest?.(INTERACTIVE)) return;
  if (String(window.getSelection?.() ?? '').length) return; // finishing a text selection, not a click
  // Ctrl/Cmd/Shift+click: leave it, a row is not a link (the name link opens in a new tab).
  if (event.metaKey || event.ctrlKey || event.shiftKey) return;
  open();
};
