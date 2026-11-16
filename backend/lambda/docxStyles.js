// Word (docx) building blocks for docxRender.js: fonts, text runs, paragraphs, tables, numbered
// list styles and page setup. Ported from the corpsec docx helpers, minus anything branded.
// createStyles(config) returns the helpers bound to one config (fonts, sizes, margins), so the
// renderer holds no global state and can render several documents in one process.
const {
  AlignmentType, BorderStyle, HeightRule, LevelFormat, NumberFormat, Paragraph, Table, TableCell, TableRow,
  TextRun, VerticalAlign, WidthType, convertInchesToTwip, convertMillimetersToTwip,
} = require('docx');

const defaultConfig = () => ({
  page: {
    // A4, 20 mm side margins.
    margin: {
      top: convertMillimetersToTwip(12.5), right: convertMillimetersToTwip(20),
      bottom: convertMillimetersToTwip(12.5), left: convertMillimetersToTwip(20),
    },
  },
  font: 'Arial',
  // Half-points. Keys match the editor's size menu: xl, lg, base, md, sm, xs.
  fontSize: { span_xl: 44, span_lg: 32, span: 22, span_base: 22, span_md: 20, span_sm: 17, span_xs: 14 },
  table: { borderThickness: 4, thShading: 'FFFFFF', margin: { top: 0, left: 0, bottom: 0, right: 0 } },
  list: { indent: 0.25 },
});

const LIST_SIZES = ['base', 'xl', 'lg', 'md', 'sm', 'xs'];
const NO_BORDER = { style: BorderStyle.NIL };
const NO_BORDERS = { top: NO_BORDER, left: NO_BORDER, right: NO_BORDER, bottom: NO_BORDER };

const createStyles = (gc = defaultConfig()) => {
  const span = (text = '', opts = {}) => new TextRun({ text, font: gc.font, break: 0, size: gc.fontSize.span, bold: false, ...opts });
  const sized = (key) => (text, opts = {}) => span(text, { size: gc.fontSize[key], ...opts });
  const span_xl = sized('span_xl');
  const span_lg = sized('span_lg');
  const span_md = sized('span_md');
  const span_sm = sized('span_sm');
  const span_xs = sized('span_xs');
  const b = (text, opts = {}) => span(text, { bold: true, ...opts });
  const b_xl = (text, opts = {}) => span_xl(text, { bold: true, ...opts });
  const br = (opts = {}) => span_xs('', { break: 1, ...opts });

  const p = (children, opts = {}) =>
    new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { before: 40, after: 40 }, alignment: AlignmentType.LEFT, ...opts });

  const table = (rows, opts = {}) =>
    new Table({ rows: Array.isArray(rows) ? rows : [rows], alignment: AlignmentType.CENTER, width: { type: WidthType.PERCENTAGE, size: 100 }, ...opts });

  const tr = (cells, opts = {}) =>
    new TableRow({ children: Array.isArray(cells) ? cells : [cells], cantSplit: true, height: { value: 100, rule: HeightRule.ATLEAST }, ...opts });

  // col: width in twelfths of the page (1-12).
  const td = (children, opts = {}) => {
    const thickness = gc.table.borderThickness;
    const o = {
      columnSpan: 12,
      borders: {
        top: { style: BorderStyle.SINGLE, size: thickness }, left: { style: BorderStyle.SINGLE, size: thickness },
        bottom: { style: BorderStyle.SINGLE, size: thickness }, right: { style: BorderStyle.SINGLE, size: thickness },
      },
      shading: { fill: 'FFFFFF' },
      verticalAlign: VerticalAlign.CENTER,
      margins: { marginUnitType: WidthType.DXA, ...gc.table.margin },
      width: { type: WidthType.PERCENTAGE, size: 100 },
      ...opts,
    };
    if (opts.col) {
      o.width = { type: WidthType.PERCENTAGE, size: (opts.col * 100) / 12 };
      o.columnSpan = opts.col;
    }
    delete o.col;
    // A table cell must hold at least one paragraph, or Word calls the file corrupt.
    const kids = (Array.isArray(children) ? children : [children]).filter(Boolean);
    return new TableCell({ children: kids.length ? kids : [p([])], ...o });
  };
  const td2 = td;
  const td_noBorder = (children, opts = {}) =>
    td(children, {
      shading: { fill: gc.table.thShading },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      ...opts,
    });

  const levelStyle = (indentMultiple, size) => ({
    paragraph: {
      run: { size, font: gc.font },
      indent: { left: convertInchesToTwip(gc.list.indent * indentMultiple), hanging: convertInchesToTwip(gc.list.indent) },
    },
  });
  // One numbering definition per text size: "my-list-style" (base) and "my-list-style-<size>".
  const numberingConfig = () =>
    LIST_SIZES.map((sz) => {
      const size = gc.fontSize[`span_${sz}`];
      return {
        reference: sz === 'base' ? 'my-list-style' : `my-list-style-${sz}`,
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: levelStyle(1, size) },
          { level: 1, format: LevelFormat.LOWER_ROMAN, text: '%2.', alignment: AlignmentType.START, style: levelStyle(2, size) },
          { level: 2, format: LevelFormat.LOWER_LETTER, text: '%3.', alignment: AlignmentType.START, style: levelStyle(3, size) },
          { level: 3, format: LevelFormat.DECIMAL, text: '(%4)', alignment: AlignmentType.START, style: levelStyle(4, size - 3) },
          { level: 4, format: LevelFormat.LOWER_ROMAN, text: '(%5)', alignment: AlignmentType.START, style: levelStyle(5, size - 3) },
        ],
      };
    });

  // headers/footers: { default: Header|Footer } or omitted.
  const pageStyle = ({ header, footer } = {}) => ({
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: gc.page.margin,
        pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
      },
    },
    ...(header && { headers: { default: header } }),
    ...(footer && { footers: { default: footer } }),
  });

  return { gc, span, span_xl, span_lg, span_md, span_sm, span_xs, b, b_xl, br, p, table, tr, td, td2, td_noBorder, numberingConfig, pageStyle, NO_BORDERS };
};

module.exports = { createStyles, defaultConfig, NO_BORDERS };
