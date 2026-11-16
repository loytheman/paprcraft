// CSV export in the browser: build the text and hand it to the browser as a file download.
const cell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// columns = [{ label, value: (row) => any }]
export const toCsv = (rows, columns) =>
  [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(','))].join('\r\n');

export const downloadCsv = (filename, text) => {
  // The BOM makes Excel read the file as UTF-8 (monitor names can be any language).
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// "acme-website" from "Acme website!" for file names.
export const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
