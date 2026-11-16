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
// Placeholders: a Quill placeholder embed ({ text, value }) resolves to values[KEY] (this export),
// else template.placeholders[KEY] (saved on the template), else the embed's own value, else it
// stays as a highlighted {{KEY}}. KEY matching ignores case and surrounding spaces. {{KEY}} typed
// as plain text is replaced the same way (but never highlighted).
const {
  AlignmentType, BorderStyle, Document, Footer, Header, HeightRule, PageBreak, Paragraph, ShadingType, TextRun,
  VerticalAlign, convertInchesToTwip,
} = require('docx');
const { createStyles } = require('./docxStyles');

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

const render = (template, values = {}) => {
  const S = createStyles();
  const { gc, span, span_sm, b, b_xl, br, p, table, tr, td, td2, td_noBorder } = S;
  const lookup = buildLookup(template?.placeholders, values);
  // Per-render state (the original kept these as module globals).
  const state = { trackItemId: [], listInstance: 0, listFontSize: undefined };

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
            customSpan(v ?? `{{${normKey(ph.text)}}}`, op.attributes, v ? {} : { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FFFF00' } })
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

  const table01 = (o, lv) =>
    o.item?.data?.length
      ? [table(o.item.data.map((e) => tr([td2(cellOf(o, e.col1, lv), { col: 2, verticalAlign: top, borders: noBorders }), colon(1), td2(cellOf(o, e.col2, 0, true), { col: 9, verticalAlign: top, borders: noBorders })])))]
      : [];
  const table02 = (o, lv) =>
    o.item?.data?.length
      ? [table(o.item.data.map((e, i) => tr([td2([p(span(`${i + 1}.`))], { col: 0.5, verticalAlign: top, borders: noBorders }), td2(cellOf(o, e.col1, lv), { col: 3.5, verticalAlign: top, borders: noBorders }), colon(0.5), td2(cellOf(o, e.col2, 0, true), { col: 7.5, verticalAlign: top, borders: noBorders })])))]
      : [];
  const margins3 = { top: 4, left: 140, bottom: 4, right: 140 };
  const table03 = (o, lv) =>
    o.item?.data?.length
      ? [table(o.item.data.map((e) => tr(['col1', 'col2', 'col3'].map((c) => td2(cellOf(o, e[c], lv), { col: 4, verticalAlign: top, margins: margins3 })))))]
      : [];

  // ---- block dispatch --------------------------------------------------------------------------
  const generateItem = (o, level = 0) => {
    const d = o?.item?.data;
    switch (o?.type) {
      case 'list':
        return (Array.isArray(o.item) ? o.item : []).flatMap((e) => generateItem(e, level + 1));
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

  // Each template section starts on a new page. A page-break-02 block also ends the current Word
  // section (its footer gets ".../M") and starts one whose header shows "-N-". Word headers and
  // footers belong to a whole section, so they repeat on every page of it.
  const sections = [];
  for (const sec of template?.section ?? []) {
    state.trackItemId = [];
    let children = [];
    let header = null;
    let footer = null;
    const close = () => {
      sections.push({ ...S.pageStyle({ header, footer }), children: children.length ? children : [p([])] });
      children = [];
    };
    for (const rawBlock of sec?.list ?? []) {
      const block = fillDataFields(rawBlock);
      if (block?.type === 'list') {
        state.listInstance += 1;
        state.listFontSize = block?.item?.[0]?.item?.delta?.ops?.[0]?.attributes?.size;
      }
      if (block?.type === 'page-break-02') {
        footer = pageNoFooter(block.item?.data?.footerPageNo || '2');
        const next = block.item?.data?.headerPageNo || '2';
        close();
        header = pageNoHeader(next);
        footer = null;
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
