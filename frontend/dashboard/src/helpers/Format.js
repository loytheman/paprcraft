// Display formatting shared by the views.

export const formatPercent = (ratio, digits = 2) => (ratio == null ? '—' : `${(ratio * 100).toFixed(digits)}%`);

export const formatMs = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`);

export const formatDuration = (seconds) => {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

export const formatRelative = (iso, now = Date.now()) => {
  if (!iso) return 'never';
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 0) return `in ${formatDuration(-s)}`;
  if (s < 10) return 'just now';
  return `${formatDuration(s)} ago`;
};

export const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const formatTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';

export const daysUntil = (iso, now = Date.now()) => (iso ? Math.floor((Date.parse(iso) - now) / 86400000) : null);
export const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const expiryText = (iso) => {
  const d = daysUntil(iso);
  if (d == null) return '—';
  if (d < 0) return `expired ${formatDate(iso)}`;
  return `${d} day${d === 1 ? '' : 's'} left · ${formatDate(iso)}`;
};
// Warn colour for an expiry date: down once passed, warn within 30 days.
export const expiryTone = (iso) => {
  const d = daysUntil(iso);
  return d == null ? 'text-ink-faint' : d < 0 ? 'text-down' : d <= 30 ? 'text-warn' : 'text-ink';
};

// A <input type="datetime-local"> value for an ISO time, in the browser's time zone.
export const toLocalInput = (iso) => (iso ? new Date(Date.parse(iso) - new Date(iso).getTimezoneOffset() * 60e3).toISOString().slice(0, 16) : '');
