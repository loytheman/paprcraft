// Renders a paprcraft document template to a Word document. Pure: no AWS, no I/O, so it is unit
// tested directly (test/docxRender.test.js). Called by docxTemplate.js (the Lambda handler).
//
// template = { name, section: [{ name, list: [block] }], placeholders: { KEY: "value" } }
// A block is { id, type, item }, the JSON the dashboard editor saves:
//   paragraph               item: { text, delta }            (Quill delta; sizes xl..xs, bold, italic, underline, strike)
//   list                    item: [ list-item-paragraph | list ]   (numbered, nested up to 5 levels)
//   table-01 / 02 / 03      item: { data: [{ col1, col2, col3 }] }  (each col is { text, delta }); 01 = "label : value", 02 = numbered "label : value", 03 = three columns
//   page-break              start a new page
//   page-break-02           new page with "-N-" at the top of the new page and ".../M" at the foot of the one before
//   layout-company-header-01  item.data: { companyName, companyRegNo, subHeader, incorporationLine? }
//   layout-corpsec-header-01  letterhead: item.data: { companyName, companyRegNo, subHeader (one line per \n) }
//   layout-company-act      item.data: { subHeader, title? }          boxed "THE COMPANIES ACT" heading
//   layout-form-45b         item.data: { subHeader?, title? }         boxed heading with "FORM 45B" at the right
//   sign-area-01..04        item.data: see signArea01..04
//   repeat                  item: { group, list: [block] }       renders `list` once per row of the form's group
//   if                      item: { cond, list: [block] }        renders `list` only when the visibleIf `cond` holds
//   table-01/02/03 with item.repeatGroup: the first data row is repeated once per row of that group
//   form-table              item: { title, rows: [{ repeat?, stack?, cells: [{ label?, value, list?, col? }] }] }
//                           the corpsec "section table": shaded title row, then label-over-bold-value cells (6/6 for two, full width
//                           for one...). list: the value is one {{key}} chip resolving to an array, shown as numbered UPPER CASE items.
//                           stack: all cells of the row share one cell. repeat: the row is repeated per row of that form group.
//                           head: true makes a cell a column title (small, not bold, no label, the value is substituted, empty stays
//                           empty): a row of head cells followed by rows of bold values with explicit `col`s is the reference's
//                           Shareholders / Officers table.
//   form-checklist          item: { title, subtitle?, rows: [{ text, value }] }
//                           the corpsec checklist: title row, optional subtitle row, a spacer, then numbered questions with real
//                           Word check boxes (value = a {{key}} chip resolving to true / false; unanswered = both boxes empty)
//   form-declaration        item: { title?, text?, signatureLabel?, nameLabel?, dateLabel?, signer? }
//                           the corpsec declaration table (text, signature line, name line, date line); signer = a {{key}} chip
//                           whose name is printed on the name line when it resolves
// Template look: template.style is "letter" (default: Arial, 20 mm margins, white table headers) or "form" (the corpsec CDD form:
// Calibri, 12.7 mm margins, grey F2F2F2 table headers). template.frame = { headerLeft, headerRight, footerLeft } puts the corpsec
// header (two shaded cells) and footer (left text, right "Page N/M", per Word section) on every page; strings may hold
// placeholders. Built-in values anywhere: {{submission_ref}} {{submission_title}} {{form_name}} {{generated_date}} (the caller's
// `values` win).
// Placeholders: a Quill placeholder embed ({ text, value }) resolves, in order, to values[KEY] (this
// export's overrides), the form's data (render's third argument, the form engine's flatten()), then
// template.placeholders[KEY] (saved on the template), then the embed's own value; if none has it, it
// stays as a highlighted {{KEY}}. KEY matching ignores case and surrounding spaces. {{KEY}} typed
// as plain text is replaced the same way (but never highlighted).
//   {{key}}            a form field; {{checks.q1}} digs into an object (a checklist)
//   {{owners.name}}    inside a repeat (or a repeating table) of `owners`: that row's field; {{owners.#}} is the row number (1-based)
//   {{key|pipe}}       formats it. Pipes: yesno ("☒ YES   ☐ NO" for true, "☐ YES   ☒ NO" for false), check (just ☒ or ☐),
//                      date (2024-08-08 -> 08 AUG 2024), upper, lower, list (array -> "a, b"), country (ISO-2 -> name).
//                      Unknown pipes are ignored; pipes chain left to right.
const {
  AlignmentType, BorderStyle, Document, Footer, Header, HeightRule, PageBreak, Paragraph, ShadingType, TextRun,
  VerticalAlign, convertInchesToTwip,
} = require('docx');
const { createStyles, configFor } = require('./docxStyles');
const { evalCond } = require('./formEngine');

const normKey = (k) => String(k ?? '').trim().toUpperCase();
const filled = (v) => typeof v === 'string' && v.trim() !== '';

const buildLookup = (saved = {}, values = {}) => {
  const map = new Map();
  for (const src of [saved, values]) for (const [k, v] of Object.entries(src ?? {})) if (filled(v)) map.set(normKey(k), String(v));
  return (key) => map.get(normKey(key)) ?? null;
};

// The placeholder inside a delta op, or null. The editor stores { insert: { text, value }, attributes: { placeholder: true } };
// { insert: { placeholder: { text, value } } } is read too.
const placeholderOf = (op) => {
  const ins = op?.insert;
  if (!ins || typeof ins !== 'object') return null;
  const ph = ins.placeholder && typeof ins.placeholder === 'object' ? ins.placeholder : ins;
  return ph.text !== undefined || op.attributes?.placeholder ? { text: ph.text ?? '', value: ph.value } : null;
};

const keyEq = (a, b) => normKey(a) === normKey(b);
const blank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
// Follows path segments through nested objects, ignoring key case.
const dig = (obj, segs) => {
  let cur = obj;
  for (const seg of segs) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    const k = Object.keys(cur).find((x) => keyEq(x, seg));
    if (k === undefined) return undefined;
    cur = cur[k];
  }
  return cur;
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const asText = (v) => (v === true ? 'Yes' : v === false ? 'No' : Array.isArray(v) ? v.map(asText).join(', ') : v && typeof v === 'object' ? '' : String(v ?? ''));
const toBool = (v) => {
  if (v === true || v === false) return v;
  const s = String(v ?? '').trim().toLowerCase();
  return ['true', 'yes', 'y', '1'].includes(s) ? true : ['false', 'no', 'n', '0'].includes(s) ? false : null;
};
const regionNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
const PIPES = {
  yesno: (v) => { const t = toBool(v); return t === null ? v : t ? '☒ YES   ☐ NO' : '☐ YES   ☒ NO'; },
  check: (v) => { const t = toBool(v); return t === null ? v : t ? '☒' : '☐'; },
  date: (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? '')); return m && MONTHS[Number(m[2]) - 1] ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : v; },
  upper: (v) => asText(v).toUpperCase(),
  lower: (v) => asText(v).toLowerCase(),
  list: (v) => asText(v),
  country: (v) => {
    const code = String(v ?? '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return v;
    try { return regionNames?.of(code) || code; } catch { return code; }
  },
};
const todayText = () => PIPES.date(new Date().toISOString().slice(0, 10));
const formatValue = (v, pipes) => {
  let cur = v;
  for (const name of pipes) {
    const fn = PIPES[name.toLowerCase()];
    if (fn) cur = fn(cur); // unknown pipes are ignored
  }
  return asText(cur);
};
const displayKey = (text) => {
  const [k, ...pipes] = String(text ?? '').split('|');
  return [normKey(k), ...pipes.map((x) => x.trim().toLowerCase())].join('|');
};

// formData = { data, raw } from the form engine's flatten() (data: select values as labels, groups as
// rows; raw: values as stored, for `if` conditions). Optional: a plain template needs none.
const render = (template, values = {}, formData = null) => {
  const S = createStyles(configFor(template?.style));
  const { gc, span, span_sm, span_md, b, b_xl, b_md, b_sm, br, t, p, table, tr, td, td2, td_noBorder, th, tr2, tr_showHeader, tr_empty, checkbox, li } = S;
  // Built-ins first, then the caller's values (which win): see the header comment.
  const overrides = buildLookup({ generated_date: todayText() }, values);
  const savedMap = buildLookup(template?.placeholders, {});
  const formValues = formData?.data ?? {};
  const formRaw = formData?.raw ?? {};
  // Per-render state (the original kept these as module globals).
  const state = { trackItemId: [], listInstance: 0, listFontSize: undefined };

  // Repeat scopes, innermost last: { group, row (flattened), rawRow, index (1-based) }.
  const scopes = [];
  const withScope = (scope, fn) => {
    if (!scope) return fn();
    scopes.push(scope);
    try { return fn(); } finally { scopes.pop(); }
  };
  const rowsOf = (group) => { const v = dig(formValues, [group]); return Array.isArray(v) ? v : []; };
  const rawRowsOf = (group) => { const v = dig(formRaw, [group]); return Array.isArray(v) ? v : []; };
  const scopesFor = (group) => rowsOf(group).map((row, i) => ({ group, row, rawRow: rawRowsOf(group)[i] ?? {}, index: i + 1 }));

  // The raw value for a key (before pipes), or undefined when nothing has it. Inside a repeat of
  // `group`, `group.field` is the row's (an empty cell is shown empty, not as a highlighted placeholder).
  const resolveRaw = (keyPart) => {
    const segs = keyPart.split('.').map((x) => x.trim()).filter(Boolean);
    if (!segs.length) return undefined;
    if (segs.length >= 2) {
      for (let i = scopes.length - 1; i >= 0; i -= 1) {
        const sc = scopes[i];
        if (!keyEq(sc.group, segs[0])) continue;
        if (segs[1] === '#') return sc.index;
        const v = dig(sc.row, segs.slice(1));
        return blank(v) ? '' : v;
      }
    }
    const o = overrides(keyPart);
    if (o !== null) return o;
    const v = dig(formValues, segs);
    if (!blank(v)) return v;
    return savedMap(keyPart) ?? undefined;
  };
  // "key" or "key|pipe|pipe" -> text, or null when unresolved.
  // A key of the bound form that has no answer prints "-" (like the paper forms); only a chip that
  // points at nothing at all stays a highlighted {{KEY}}, so typos still show.
  const formKeys = new Set((formData?.keys ?? []).map(normKey));
  const isFormKey = (keyPart) => formKeys.has(normKey(String(keyPart).split('.')[0]));
  const lookup = (rawKey) => {
    const [keyPart, ...pipes] = String(rawKey ?? '').split('|').map((x) => x.trim());
    const v = resolveRaw(keyPart);
    if (v === undefined || v === null) return isFormKey(keyPart) ? '-' : null;
    return formatValue(v, pipes);
  };

  const subst = (text) => String(text ?? '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, k) => lookup(k) ?? m);

  // ---- rich text -------------------------------------------------------------------------------
  const customSpan = (insert, attributes = {}, extra = {}) => {
    const options = { ...extra };
    if (attributes.bold) options.bold = true;
    if (attributes.italic) options.italics = true;
    if (attributes.underline) options.underline = {};
    if (attributes.strike) options.strike = true;
    if (attributes.size) {
      const size = gc.fontSize[`span_${attributes.size}`];
      if (size) options.size = size;
    }
    return span(insert, options);
  };

  const validToInsertNumbering = (arr) => (arr.length < 2 ? true : arr[arr.length - 1] !== arr[arr.length - 2]);
  const indentOpts = (lv) => (lv ? { indent: { left: convertInchesToTwip(gc.list.indent * lv) } } : {});

  // Quill delta -> paragraphs. The first paragraph of a block gets `opts` (e.g. the list numbering);
  // further paragraphs of the same block are indented instead, so they don't take another number.
  const processOps = (d, level = 0, opts = {}, justified = true) => {
    const children = [];
    let content = [];
    const alignment = justified ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;
    const flush = () => {
      state.trackItemId.push(d.id);
      children.push(p(content, validToInsertNumbering(state.trackItemId) ? { ...opts, alignment } : { ...indentOpts(level), alignment }));
      content = [];
    };

    for (const op of d?.item?.delta?.ops ?? []) {
      if (typeof op.insert === 'string') {
        let start = 0;
        let idx = op.insert.indexOf('\n', start);
        while (idx !== -1) {
          const part = op.insert.slice(start, idx);
          if (part.length) content.push(customSpan(subst(part), op.attributes)); // spaces between styled words count
          flush();
          start = idx + 1;
          idx = op.insert.indexOf('\n', start);
        }
        const rest = op.insert.slice(start);
        if (rest.length) content.push(customSpan(subst(rest), op.attributes));
      } else {
        const ph = placeholderOf(op);
        if (ph) {
          const v = lookup(ph.text) ?? (filled(ph.value) ? ph.value : null);
          content.push(
            customSpan(v ?? `{{${displayKey(ph.text)}}}`, op.attributes, v !== null ? {} : { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FFFF00' } })
          );
        }
        // Other embeds (images, ...) are not supported and are skipped.
      }
    }
    if (content.length) {
      state.trackItemId.push(d.id);
      children.push(p(content, validToInsertNumbering(state.trackItemId) ? { ...opts, alignment } : { ...indentOpts(level), alignment }));
    }
    return children;
  };

  // ---- layout blocks ---------------------------------------------------------------------------
  const textBreak = (text) => {
    if (!text?.length) return [];
    const words = text.split(' ');
    if (words.length > 10) {
      const m = Math.ceil(words.length / 2);
      return [words.slice(0, m).join(' '), words.slice(m).join(' ')];
    }
    return [text];
  };
  const subHeaderRuns = (sub) => {
    const arr = textBreak(sub);
    return arr.length > 1 ? [span(arr[0]), br(), span(arr[1])] : [span(arr[0] || '')];
  };

  const layoutCompanyHeader01 = (d = {}) => [
    p(
      [
        b_xl(d.companyName || ''), br(),
        ...(d.incorporationLine ? [span(d.incorporationLine), br({ break: 2 })] : []),
        span(`Company Registration No. ${d.companyRegNo || ''}`), br({ break: 3 }),
        ...subHeaderRuns(d.subHeader),
      ],
      { alignment: AlignmentType.CENTER, thematicBreak: true }
    ),
    p([]),
  ];

  // A letterhead for the issuer of the document: name, registration no., then free lines.
  const layoutCorpsecHeader01 = (d = {}) => {
    const lines = String(d.subHeader ?? '').split('\n').filter((l) => l.trim());
    return [
      table([
        tr([
          td_noBorder(
            p([
              b(d.companyName || '', { size: gc.fontSize.span }), br(),
              ...(d.companyRegNo ? [b(`UEN / Reg. No.: ${d.companyRegNo}`, { size: gc.fontSize.span_md }), br()] : []),
              ...lines.flatMap((l) => [span(l, { size: gc.fontSize.span_md }), br()]),
            ]),
            { col: 12, margins: { top: 0, left: 0, bottom: 0, right: 0 } }
          ),
        ]),
      ]),
      p(br()),
    ];
  };

  const boxed = (paras, opts = {}) => {
    const t = gc.table.borderThickness;
    const side = { style: BorderStyle.SINGLE, size: t };
    return td(paras, { borders: { top: side, left: side, right: side, bottom: side }, ...opts });
  };
  const centered = (runs) => p(runs, { alignment: AlignmentType.CENTER });

  const layoutCompanyAct = (d = {}) => [
    table([tr([td_noBorder(p([]), { col: 3 }), boxed([centered(b(d.title || 'THE COMPANIES ACT')), centered(br()), centered(b(d.subHeader || ''))], { col: 6 }), td_noBorder(p([]), { col: 3 })])]),
    p([]),
  ];

  const layoutForm45b = (d = {}) => [
    table([
      tr([
        boxed([centered(b(d.title || 'THE COMPANIES ACT')), centered(br()), centered(b(d.subHeader || 'CONSENT TO ACT AS SECRETARY'))], { col: 9 }),
        td_noBorder([p(span('FORM'), { alignment: AlignmentType.RIGHT }), p(b('45B'), { alignment: AlignmentType.RIGHT })], { col: 3, verticalAlign: VerticalAlign.TOP }),
      ]),
    ]),
    p([]),
  ];

  const spaced = (s) => (s ? s.split('').join(' ') : '');
  const dots = '............................................ ';
  const noBorders = { top: { style: BorderStyle.NIL }, left: { style: BorderStyle.NIL }, right: { style: BorderStyle.NIL }, bottom: { style: BorderStyle.NIL } };

  const signArea01 = (d) => {
    if (!d?.signers?.length) return [];
    const head = p([br(), br(), b(spaced(d.desc || '')), br(), br(), br()], { alignment: AlignmentType.CENTER });
    const pairs = [];
    for (let i = 0; i < d.signers.length; i += 2) pairs.push(d.signers.slice(i, i + 2));
    const sig = table(
      pairs.map((pair) =>
        tr(
          [
            ...pair.map((e, idx) =>
              td2(
                [p(span_sm(dots), { alignment: idx === 0 ? AlignmentType.START : AlignmentType.END }), p([span(e.name || '')], { alignment: idx === 0 ? AlignmentType.START : AlignmentType.END })],
                { col: 6, verticalAlign: VerticalAlign.BOTTOM, borders: noBorders }
              )
            ),
            ...(pair.length === 1 ? [td2([], { col: 6, borders: noBorders })] : []),
          ],
          { height: { value: 2000, rule: HeightRule.EXACT } }
        )
      )
    );
    return [head, sig];
  };
  const signArea02 = (d) => (d?.name ? [p(br({ break: 5 })), p(span_sm(dots)), p([span(d.name), br(), span(d.desc || ''), br({ break: 2 })])] : []);
  const signArea03 = (d) => (d?.name ? [p(br({ break: 5 })), p(span_sm(dots)), p([span(d.name), br(), span(d.desc || ''), br(), span(d.desc2 || ''), br({ break: 2 })])] : []);
  const signArea04 = (d = {}) => [
    p([br({ break: 2 }), b(spaced(d.desc || '')), br({ break: 10 })], { alignment: AlignmentType.CENTER }),
    p(span_sm('................................................................................................  '), { alignment: AlignmentType.CENTER }),
    p([span(d.name || ''), br(), span(d.desc2 || ''), br({ break: 2 }), b(d.desc3 || ''), br({ break: 2 })], { alignment: AlignmentType.CENTER }),
  ];

  // ---- tables ----------------------------------------------------------------------------------
  const cellOf = (o, cell, lv, justified = false) => processOps({ item: cell ?? {}, type: o.type }, lv, {}, justified);
  const top = VerticalAlign.TOP;
  const colon = (col) => td2([p(span(':'), { alignment: AlignmentType.CENTER })], { col, verticalAlign: top, borders: noBorders });

  // The rows to draw: with item.repeatGroup, the first data row once per group row (inside that row's
  // scope), then the other rows as they are.
  const tableRows = (o) => {
    const data = o.item?.data ?? [];
    const g = o.item?.repeatGroup;
    if (!g || !data.length) return data.map((e) => ({ e, scope: null }));
    return [...scopesFor(g).map((scope) => ({ e: data[0], scope })), ...data.slice(1).map((e) => ({ e, scope: null }))];
  };

  const table01 = (o, lv) => {
    const rows = tableRows(o);
    return rows.length
      ? [table(rows.map(({ e, scope }) => withScope(scope, () => tr([td2(cellOf(o, e.col1, lv), { col: 2, verticalAlign: top, borders: noBorders }), colon(1), td2(cellOf(o, e.col2, 0, true), { col: 9, verticalAlign: top, borders: noBorders })]))))]
      : [];
  };
  const table02 = (o, lv) => {
    const rows = tableRows(o);
    return rows.length
      ? [table(rows.map(({ e, scope }, i) => withScope(scope, () => tr([td2([p(span(`${i + 1}.`))], { col: 0.5, verticalAlign: top, borders: noBorders }), td2(cellOf(o, e.col1, lv), { col: 3.5, verticalAlign: top, borders: noBorders }), colon(0.5), td2(cellOf(o, e.col2, 0, true), { col: 7.5, verticalAlign: top, borders: noBorders })]))))]
      : [];
  };
  const margins3 = { top: 4, left: 140, bottom: 4, right: 140 };
  const table03 = (o, lv) => {
    const rows = tableRows(o);
    return rows.length
      ? [table(rows.map(({ e, scope }) => withScope(scope, () => tr(['col1', 'col2', 'col3'].map((c) => td2(cellOf(o, e[c], lv), { col: 4, verticalAlign: top, margins: margins3 }))))))]
      : [];
  };

  // ---- the corpsec form blocks: section table, checklist, declaration --------------------------------
  const NIL = { style: BorderStyle.NIL };
  const text = (v) => subst(String(v ?? ''));
  const orDash = (v) => (String(v ?? '').trim() === '' ? '-' : v);
  // "{{key}}" / "{{key|pipe}}" -> the key, or null when the string is anything else.
  const chipKeyOf = (v) => {
    const m = /^\s*\{\{\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}\s*$/.exec(String(v ?? ''));
    return m ? m[1] : null;
  };
  const defaultCol = (n) => ({ 1: 12, 2: 6, 3: 4, 4: 3 })[n] ?? Math.max(1, Math.round(12 / n));

  // A form-table cell's content as paragraphs. `inStack`: shown inside one shared cell (bold md values).
  const formCellParas = (cell, listId, inStack = false, first = true) => {
    if (cell?.head) return [p([span_sm(text(cell.value))])]; // a column title
    const label = cell?.label ? text(cell.label) : '';
    const out = [];
    const items = (() => {
      if (!cell?.list) return null;
      const key = chipKeyOf(cell.value);
      const raw = key ? resolveRaw(key) : undefined;
      const arr = Array.isArray(raw) ? raw.map(asText) : blank(raw) ? [] : [asText(raw)];
      return arr.length ? arr : ['-'];
    })();
    if (inStack) {
      if (label) out.push(p(first ? [span_sm(label)] : [br(), span_sm(label)]));
      if (items) items.forEach((it) => out.push(li(b_md(String(it).toUpperCase()), { listId })));
      else out.push(p([b_md(String(orDash(text(cell?.value))))]));
      return out;
    }
    if (items) {
      if (label) out.push(p([span_sm(label)]));
      items.forEach((it) => out.push(li(b_md(String(it).toUpperCase()), { listId })));
      return out;
    }
    const value = String(orDash(text(cell?.value)));
    out.push(label ? p([span_sm(label), br(), t(), b(value)]) : p([b(value)]));
    return out;
  };

  const formTableRow = (row, listId) => {
    const cells = Array.isArray(row?.cells) ? row.cells.filter((c) => c && typeof c === 'object') : [];
    if (!cells.length) return null;
    if (row.stack) return tr([td2(cells.flatMap((c, i) => formCellParas(c, listId, true, i === 0)))]);
    return tr(cells.map((c) => td(formCellParas(c, listId), { col: Number.isFinite(c.col) && c.col >= 1 && c.col <= 12 ? c.col : defaultCol(cells.length) })));
  };

  const formTable = (o) => {
    if (!o.item || typeof o.item !== 'object') return [];
    const it = o.item;
    state.listInstance += 1; // numbered list cells restart per table
    const listId = state.listInstance;
    const rows = [tr([th(p(span(text(it.title))))])];
    for (const row of Array.isArray(it.rows) ? it.rows : []) {
      try {
        const scopeList = row?.repeat ? scopesFor(row.repeat) : [null];
        for (const sc of scopeList) {
          const r = withScope(sc, () => formTableRow(row, listId));
          if (r) rows.push(r);
        }
      } catch (err) {
        console.error(JSON.stringify({ msg: 'docx: form-table row skipped', error: String(err?.message || err) }));
      }
    }
    return [table(rows)];
  };

  // true / false / null (unanswered) from a {{key}} chip, or a plain true / false / yes / no.
  const flagOf = (value) => {
    const key = chipKeyOf(value);
    if (key) return toBool(resolveRaw(key));
    return toBool(text(value));
  };

  const formChecklist = (o) => {
    if (!o.item || typeof o.item !== 'object') return [];
    const it = o.item;
    state.listInstance += 1; // the question numbers restart per checklist
    const listId = state.listInstance;
    const rows = [tr([th(p(span(text(it.title))))])];
    if (it.subtitle) rows.push(tr([td(p(span_sm(text(it.subtitle))))]));
    rows.push(tr_empty());
    for (const row of Array.isArray(it.rows) ? it.rows : []) {
      try {
        if (!row || typeof row !== 'object') continue;
        rows.push(
          tr2(
            [
              td2(li(span_md(text(row.text)), { listId }), { col: 9, borders: { right: NIL } }),
              td(p(checkbox(flagOf(row.value)), { alignment: AlignmentType.RIGHT }), { col: 3, borders: { left: NIL } }),
            ],
            { cantSplit: true }
          )
        );
      } catch (err) {
        console.error(JSON.stringify({ msg: 'docx: form-checklist row skipped', error: String(err?.message || err) }));
      }
    }
    return [table(rows)];
  };

  const DECLARATION_TEXT =
    'I declare that the information provided in this form is accurate and truthful. I understand that if I am found to have knowingly made false statements or intentionally omitted any significant details, I may face prosecution and legal penalties under applicable law.';
  const LINE = '__________________________________________';
  const formDeclaration = (o) => {
    const it = o.item ?? {};
    const signerKey = chipKeyOf(it.signer);
    const signer = signerKey ? lookup(signerKey) : it.signer ? text(it.signer) : null;
    const signerName = signer && signer !== '-' && !/\{\{/.test(signer) ? signer : '';
    const nameLabel = it.nameLabel
      ? [b_sm(text(it.nameLabel))]
      : [b_sm('Name of Officer/ Shareholder/ Beneficial Owner/'), br(), b_sm('Purchaser/ Customer')];
    return [
      table([
        tr_showHeader([th(p(span(text(it.title || 'Declaration'))))]),
        tr([td2(p([span_md(text(it.text || DECLARATION_TEXT)), br({ break: 3 })]), { borders: { bottom: NIL } })]),
        tr([td([p([b_sm(text(it.signatureLabel || 'Signature:'))]), p([br({ break: 2 })])], { borders: { top: NIL, bottom: NIL } })]),
        tr([
          td2([signerName ? p(span_md(signerName, { underline: {} })) : p(span_sm(LINE)), p(nameLabel)], { col: 8, borders: { top: NIL, right: NIL } }),
          td2([p(span_sm(LINE)), p(b_sm(text(it.dateLabel || 'Date')))], { col: 4, verticalAlign: top, borders: { top: NIL, left: NIL } }),
        ]),
      ]),
    ];
  };

  const safely = (fn) => {
    try {
      return fn();
    } catch (err) {
      console.error(JSON.stringify({ msg: 'docx: block skipped', error: String(err?.message || err) }));
      return [];
    }
  };

  // ---- block dispatch --------------------------------------------------------------------------
  const generateItem = (block, level = 0) => {
    const o = fillDataFields(block);
    const d = o?.item?.data;
    switch (o?.type) {
      case 'list':
        if (level === 0) {
          state.listInstance += 1; // each top-level list (also inside a repeat row) restarts its numbering
          state.listFontSize = o.item?.[0]?.item?.delta?.ops?.[0]?.attributes?.size;
        }
        return (Array.isArray(o.item) ? o.item : []).flatMap((e) => generateItem(e, level + 1));
      case 'repeat': {
        const group = o.item?.group;
        const out = [];
        scopesFor(group).forEach((scope, i) => {
          withScope(scope, () => {
            state.trackItemId.push(`__repeat:${group}:${i}`); // so a row's first list item doesn't read as a continuation of the last row's
            for (const inner of Array.isArray(o.item?.list) ? o.item.list : []) out.push(...generateItem(inner, level));
          });
        });
        return out;
      }
      case 'if': {
        const rawRow = scopes[scopes.length - 1]?.rawRow ?? {};
        return evalCond(o.item?.cond, { ...formRaw, ...rawRow }) ? (Array.isArray(o.item?.list) ? o.item.list : []).flatMap((inner) => generateItem(inner, level)) : [];
      }
      case 'paragraph':
        return processOps(o, level, indentOpts(level));
      case 'list-item-paragraph': {
        const numbering = { level: level - 1, instance: state.listInstance, reference: 'my-list-style' };
        if (state.listFontSize && state.listFontSize !== 'base') numbering.reference = `my-list-style-${state.listFontSize}`;
        return processOps(o, level, { numbering });
      }
      case 'layout-company-header-01': return layoutCompanyHeader01(d);
      case 'layout-corpsec-header-01': return layoutCorpsecHeader01(d);
      case 'layout-company-act': return layoutCompanyAct(d);
      case 'layout-form-45b': return layoutForm45b(d);
      case 'sign-area-01': return signArea01(d);
      case 'sign-area-02': return signArea02(d);
      case 'sign-area-03': return signArea03(d);
      case 'sign-area-04': return signArea04(d);
      case 'table-01': return table01(o, level);
      case 'table-02': return table02(o, level);
      case 'table-03': return table03(o, level);
      case 'form-table': return safely(() => formTable(o));
      case 'form-checklist': return safely(() => formChecklist(o));
      case 'form-declaration': return safely(() => formDeclaration(o));
      case 'page-break': return [p([new PageBreak()])];
      default: return []; // unknown block types are skipped, never fatal
    }
  };

  const pageNoHeader = (n) => new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(`-${n}-`)] })] });
  const pageNoFooter = (n) => new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(`.../${n}`)] })] });

  // Headers and signature blocks keep plain strings in item.data (company name, reg no., signer
  // names...): {{KEY}} typed there resolves like a chip does.
  const fillDeep = (v) => (typeof v === 'string' ? subst(v) : Array.isArray(v) ? v.map(fillDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x)])) : v);
  const fillDataFields = (block) => (/^(layout-|sign-area-)/.test(block?.type ?? '') && block?.item?.data ? { ...block, item: { ...block.item, data: fillDeep(block.item.data) } } : block);

  // template.frame: the same header and footer on every Word section (placeholders and built-ins resolved).
  const frame = (() => {
    const f = template?.frame;
    if (!f || typeof f !== 'object') return null;
    const r = { headerLeft: text(f.headerLeft), headerRight: text(f.headerRight), footerLeft: text(f.footerLeft) };
    return Object.values(r).some((v) => v.trim()) ? r : null;
  })();

  // Each template section starts on a new page. A page-break-02 block also ends the current Word
  // section (its footer gets ".../M") and starts one whose header shows "-N-". Word headers and
  // footers belong to a whole section, so they repeat on every page of it.
  const sections = [];
  for (const sec of template?.section ?? []) {
    state.trackItemId = [];
    let children = [];
    let header = frame ? S.frameHeader(frame) : null;
    let footer = frame ? S.frameFooter(frame) : null;
    const close = () => {
      sections.push({ ...S.pageStyle({ header, footer }), children: children.length ? children : [p([])] });
      children = [];
    };
    for (const block of sec?.list ?? []) {
      if (block?.type === 'page-break-02') {
        // With a template frame the new Word section keeps the frame's header and footer.
        if (!frame) footer = pageNoFooter(block.item?.data?.footerPageNo || '2');
        const next = block.item?.data?.headerPageNo || '2';
        close();
        header = frame ? S.frameHeader(frame) : pageNoHeader(next);
        footer = frame ? S.frameFooter(frame) : null;
        continue;
      }
      children.push(...generateItem(block));
    }
    close();
  }

  return new Document({
    creator: 'paprcraft',
    title: template?.name || 'Document',
    numbering: { config: S.numberingConfig() },
    sections: sections.length ? sections : [{ ...S.pageStyle(), children: [p([])] }],
  });
};

module.exports = { render, buildLookup, placeholderOf };
