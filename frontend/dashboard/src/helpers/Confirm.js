// `await askConfirm({ title, message, confirmLabel, icon?, tone? })` resolves true or false. App.vue
// renders the one OpConfirmDialog this state drives. Defaults to the destructive look (deletes).
import { reactive } from 'vue';

const DEFAULTS = { title: '', message: '', confirmLabel: '', cancelLabel: 'Cancel', icon: 'trash', tone: 'destructive' };
export const confirmState = reactive({ open: false, ...DEFAULTS });

let settle = null;

export const answerConfirm = (ok) => {
  confirmState.open = false;
  settle?.(ok);
  settle = null;
};

export const askConfirm = (options) => {
  answerConfirm(false); // a newer question replaces an unanswered one
  Object.assign(confirmState, DEFAULTS, options, { open: true });
  return new Promise((resolve) => { settle = resolve; });
};
