// docx template rendering (docxRender.js) and the Lambda handler (docxTemplate.js). The renderer is
// checked by unzipping the produced .docx and reading its XML; the handler runs on in-memory fakes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { Packer } = require('docx');
const { render } = require('../docxRender.js');
const { makeHandler } = require('../docxTemplate.js');

const para = (text, over = {}) => ({ id: `p${text}`, type: 'paragraph', item: { text, delta: { ops: [{ insert: `${text}\n` }] } }, ...over });
const rich = (ops, id = 'r1') => ({ id, type: 'paragraph', item: { delta: { ops } } });
const ph = (text, value = '') => ({ insert: { text, value }, attributes: { placeholder: true } });
const cell = (text) => ({ text, delta: { ops: [{ insert: `${text}\n` }] } });
const tpl = (list, extra = {}) => ({ name: 'T', section: [{ name: 's1', list }], placeholders: {}, ...extra });

const unzip = async (doc) => {
  const buf = await Packer.toBuffer(doc);
  assert.equal(buf.subarray(0, 2).toString(), 'PK'); // a zip
  const zip = await JSZip.loadAsync(buf);
  const files = {};
  for (const name of Object.keys(zip.files)) if (name.endsWith('.xml')) files[name] = await zip.files[name].async('string');
  return { files, doc: files['word/document.xml'], all: Object.values(files).join('\n') };
};
const textOf = (xml) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('|');

test('paragraph: text, bold/italic/underline/size, multiple lines', async () => {
  const { doc } = await unzip(render(tpl([
    rich([{ insert: 'Plain ' }, { insert: 'Bold', attributes: { bold: true } }, { insert: ' ' }, { insert: 'Big', attributes: { size: 'xl', italic: true, underline: true } }, { insert: '\nSecond line\n' }]),
  ])));
  const t = textOf(doc);
  assert.match(t, /Plain \|Bold\| \|Big/);
  assert.match(t, /Second line/);
  assert.match(doc, /<w:b\/>/);
  assert.match(doc, /<w:i\/>/);
  assert.match(doc, /<w:u /);
  assert.match(doc, /<w:sz w:val="44"\/>/); // xl
});

test('placeholders: this export beats the saved value, which beats the embed value; unresolved stays {{KEY}} highlighted', async () => {
  const list = [
    rich([{ insert: 'A=' }, ph('company', 'EmbedCo'), { insert: ' B=' }, ph(' Name ', 'EmbedName'), { insert: ' C=' }, ph('EMBED_ONLY', 'EmbedValue'), { insert: ' D=' }, ph('MISSING'), { insert: ' E={{Typed}}\n' }]),
  ];
  const { doc } = await unzip(render(tpl(list, { placeholders: { COMPANY: 'SavedCo', name: 'SavedName', typed: 'Plain' } }), { Company: 'ExportCo' }));
  const t = textOf(doc);
  assert.match(t, /A=\|ExportCo/); // values override saved and embed
  assert.match(t, /B=\|SavedName/); // saved beats embed; key matching ignores case and spaces
  assert.match(t, /C=\|EmbedValue/); // embed's own value when nothing else is set
  assert.match(t, /D=\|\{\{MISSING\}\}/); // unresolved stays visible...
  assert.match(doc, /w:fill="FFFF00"/); // ...and highlighted
  assert.match(t, /E=Plain/); // {{KEY}} typed as text is replaced too
});

test('numbered lists, nested, continue numbering per list and use the list text size', async () => {
  const item = (text, id) => ({ id, type: 'list-item-paragraph', item: { delta: { ops: [{ insert: `${text}\n` }] } } });
  const sm = (text, id) => ({ id, type: 'list-item-paragraph', item: { delta: { ops: [{ insert: text, attributes: { size: 'sm' } }, { insert: '\n' }] } } });
  const { doc, files } = await unzip(render(tpl([
    { id: 'L1', type: 'list', item: [item('One', 'a'), { id: 'N', type: 'list', item: [item('Nested', 'b')] }, item('Two', 'c')] },
    { id: 'L2', type: 'list', item: [sm('Small', 'd')] },
  ])));
  assert.match(textOf(doc), /One\|Nested\|Two\|Small/);
  assert.match(doc, /<w:ilvl w:val="1"\/>/); // the nested list is level 1
  assert.match(doc, /<w:ilvl w:val="0"\/>/);
  assert.match(doc, /<w:numId w:val="\d+"\/>/);
  const ids = new Set([...doc.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]));
  assert.equal(ids.size, 2); // each list is its own numbering instance, so the second restarts at 1
  assert.match(files['word/numbering.xml'], /<w:sz w:val="17"\/>/); // the small-text list style exists
});

test('tables 01 / 02 / 03', async () => {
  const { doc } = await unzip(render(tpl([
    { id: 't1', type: 'table-01', item: { data: [{ col1: cell('Name'), col2: cell('Alice') }] } },
    { id: 't2', type: 'table-02', item: { data: [{ col1: cell('First'), col2: cell('Alpha') }, { col1: cell('Second'), col2: cell('Beta') }] } },
    { id: 't3', type: 'table-03', item: { data: [{ col1: cell('A'), col2: cell('B'), col3: cell('C') }] } },
    { id: 't4', type: 'table-01', item: { data: [{ col1: { text: '', delta: '' }, col2: { text: '', delta: '' } }] } }, // empty cells must still be valid
  ])));
  assert.equal((doc.match(/<w:tbl>/g) || []).length, 4);
  const t = textOf(doc);
  assert.match(t, /Name\|:\|Alice/);
  assert.match(t, /1\.\|First\|:\|Alpha\|2\.\|Second\|:\|Beta/);
  assert.match(t, /A\|B\|C/);
  assert.equal((doc.match(/<w:tc>(?:(?!<\/w:tc>).)*?<\/w:tc>/gs) || []).every((c) => c.includes('<w:p>') || c.includes('<w:p ')), true); // every cell has a paragraph
});

test('layout blocks: company header, letterhead, company act, form 45B', async () => {
  const { doc } = await unzip(render(tpl([
    { id: 'h1', type: 'layout-company-header-01', item: { data: { companyName: 'ACME PTE. LTD.', companyRegNo: '2019123X', subHeader: 'NOTICE OF MEETING', incorporationLine: '(Incorporated in Nowhere)' } } },
    { id: 'h2', type: 'layout-corpsec-header-01', item: { data: { companyName: 'Letterhead Co', companyRegNo: 'R-1', subHeader: '1 Main Road\nCity 123' } } },
    { id: 'h3', type: 'layout-company-act', item: { data: { subHeader: 'RETURN OF ALLOTMENT OF SHARES' } } },
    { id: 'h4', type: 'layout-form-45b', item: { data: {} } },
  ])));
  const t = textOf(doc);
  assert.match(t, /ACME PTE\. LTD\./);
  assert.match(t, /\(Incorporated in Nowhere\)/);
  assert.match(t, /Company Registration No\. 2019123X/);
  assert.match(t, /NOTICE OF MEETING/);
  assert.match(t, /Letterhead Co/);
  assert.match(t, /UEN \/ Reg\. No\.: R-1/);
  assert.match(t, /1 Main Road\|City 123/);
  assert.match(t, /THE COMPANIES ACT\|RETURN OF ALLOTMENT OF SHARES/);
  assert.match(t, /CONSENT TO ACT AS SECRETARY/);
  assert.match(t, /FORM\|45B/);
});

test('signature areas 01-04', async () => {
  const { doc } = await unzip(render(tpl([
    { id: 's1', type: 'sign-area-01', item: { data: { desc: 'DIRECTORS', signers: [{ name: 'ALAN TAN' }, { name: 'BRYAN SU' }, { name: 'CLARICE YEE' }] } } },
    { id: 's2', type: 'sign-area-02', item: { data: { name: 'JAMES LEE', desc: 'Chairman' } } },
    { id: 's3', type: 'sign-area-03', item: { data: { name: 'JAMES DEAN', desc: 'Corporate Representative', desc2: 'REBEL PTE LTD' } } },
    { id: 's4', type: 'sign-area-04', item: { data: { desc: 'SHAREHOLDER', name: 'DON LIM', desc2: 'Representative', desc3: 'HOLDCO PTE LTD' } } },
    { id: 's5', type: 'sign-area-01', item: { data: { desc: 'NOBODY', signers: [] } } }, // no signers: nothing rendered
  ])));
  const t = textOf(doc);
  assert.match(t, /D \| ?I \| ?R|D I R E C T O R S/); // letter-spaced title
  assert.match(t, /ALAN TAN/);
  assert.match(t, /BRYAN SU/);
  assert.match(t, /CLARICE YEE/);
  assert.match(t, /JAMES LEE\|Chairman/);
  assert.match(t, /JAMES DEAN\|Corporate Representative\|REBEL PTE LTD/);
  assert.match(t, /DON LIM\|Representative\|HOLDCO PTE LTD/);
  assert.doesNotMatch(t, /N O B O D Y/);
  assert.match(doc, /\.{20}/); // signature lines
});

test('page breaks: plain break, and page-break-02 with -N- header and .../M footer', async () => {
  const { doc, all, files } = await unzip(render(tpl([
    para('Before'),
    { id: 'pb', type: 'page-break', item: { data: null } },
    para('Middle'),
    { id: 'pb2', type: 'page-break-02', item: { data: { footerPageNo: '3', headerPageNo: '2' } } },
    para('After'),
  ])));
  assert.match(doc, /<w:br w:type="page"\/>/);
  assert.match(textOf(doc), /Before.*Middle.*After/);
  assert.equal((doc.match(/<w:sectPr/g) || []).length, 2); // page-break-02 split the section
  assert.match(all, /\.\.\.\/3/);
  assert.match(all, /-2-/);
  assert.ok(Object.keys(files).some((f) => f.startsWith('word/header')) && Object.keys(files).some((f) => f.startsWith('word/footer')));
});

test('several sections each start a page; unknown blocks and empty templates are harmless', async () => {
  const t = { name: 'T', placeholders: {}, section: [{ name: 'a', list: [para('Alpha')] }, { name: 'b', list: [{ id: 'x', type: 'something-new', item: {} }] }, { name: 'c', list: [] }] };
  const { doc } = await unzip(render(t));
  assert.equal((doc.match(/<w:sectPr/g) || []).length, 3);
  assert.match(textOf(doc), /Alpha/);
  await unzip(render({ name: 'empty', section: [] })); // still a valid document
  await unzip(render({}));
});

// ---- handler -----------------------------------------------------------------------------------

test('{{KEY}} typed in header and signature data resolves from values and saved placeholders', async () => {
  const doc = render(tpl([
    { id: 'h', type: 'layout-company-header-01', item: { data: { companyName: '{{COMPANY_NAME}}', companyRegNo: '{{REG_NO}}', subHeader: 'NOTICE' } } },
    { id: 's', type: 'sign-area-02', item: { data: { name: '{{SIGNER}}', desc: 'Director' } } },
  ], { placeholders: { COMPANY_NAME: 'Saved Co' } }), { REG_NO: '123X', SIGNER: 'Pat Doe' });
  const text = textOf((await unzip(doc)).doc);
  assert.ok(text.includes('Saved Co'));
  assert.ok(text.includes('123X'));
  assert.ok(text.includes('Pat Doe'));
  assert.ok(!text.includes('{{'));
});

const fakes = (item, { putFails = false, conflicts = 0, updateFails = false } = {}) => {
  const db = { item: item && JSON.parse(JSON.stringify(item)) };
  const log = { puts: [], updates: [], conflictsLeft: conflicts };
  const deps = {
    getItem: async () => (db.item ? JSON.parse(JSON.stringify(db.item)) : null),
    putObject: async (p) => { if (putFails) throw new Error('S3 down: secret detail'); log.puts.push(p); },
    updateItem: async (p) => {
      log.updates.push(p);
      if (log.conflictsLeft > 0) { log.conflictsLeft -= 1; throw Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' }); }
      if (updateFails) throw new Error('ddb down');
      // apply "SET #h[idx].#fN = :vN" onto the in-memory item
      const idx = Number(/#h\[(\d+)\]/.exec(p.ConditionExpression)[1]);
      assert.equal(db.item.exportHistory[idx].cbId, p.ExpressionAttributeValues[':cb']);
      for (const [k, name] of Object.entries(p.ExpressionAttributeNames)) if (k !== '#h') db.item.exportHistory[idx][name] = p.ExpressionAttributeValues[k.replace('#f', ':v')];
    },
  };
  return { db, log, deps };
};
const saved = () => ({
  pk: '#TEMPLATE:T1', sk: '#TEMPLATE#METADATA', id: 'T1', accountId: 'A1', name: 'AGM',
  section: [{ name: 's', list: [rich([{ insert: 'Dear ' }, ph('PERSON'), { insert: '\n' }])] }], placeholders: { PERSON: 'Saved' },
  exportHistory: [{ cbId: 'OLD', processStatus: 'completed' }, { cbId: 'CB1', processStatus: 'processing', createdAt: 'now' }],
});

test('handler: renders, uploads under the account folder, completes the matching entry only', async () => {
  process.env.TABLE = 'tbl'; process.env.BUCKET = 'bkt';
  const f = fakes(saved());
  const out = await makeHandler(f.deps)({ templateId: 'T1', cbId: 'CB1', values: { PERSON: 'Alice' } });
  assert.deepEqual(out, { ok: true, path: 'accounts/A1/templates/T1/exports/CB1.docx' });
  assert.equal(f.log.puts.length, 1);
  assert.equal(f.log.puts[0].Bucket, 'bkt');
  assert.equal(f.log.puts[0].Key, 'accounts/A1/templates/T1/exports/CB1.docx');
  assert.match(f.log.puts[0].ContentType, /wordprocessingml/);
  const z = await JSZip.loadAsync(f.log.puts[0].Body);
  assert.match(textOf(await z.files['word/document.xml'].async('string')), /Dear \|Alice/);
  assert.equal(f.db.item.exportHistory[1].processStatus, 'completed');
  assert.equal(f.db.item.exportHistory[1].path, 'accounts/A1/templates/T1/exports/CB1.docx');
  assert.equal(f.db.item.exportHistory[1].fileName, 'CB1.docx');
  assert.equal(f.db.item.exportHistory[0].processStatus, 'completed'); // untouched
  assert.equal(f.log.updates[0].ConditionExpression, 'attribute_exists(pk) AND #h[1].cbId = :cb'); // guarded by cbId
});

test('handler: finds the entry by cbId even if the list shifted, and retries one conflict', async () => {
  const f = fakes(saved(), { conflicts: 1 });
  const out = await makeHandler(f.deps)({ templateId: 'T1', cbId: 'CB1' });
  assert.equal(out.ok, true);
  assert.equal(f.log.updates.length, 2);
  assert.equal(f.db.item.exportHistory[1].processStatus, 'completed');
});

test('handler: a render/upload error marks the entry failed with a safe message and does not throw', async () => {
  const f = fakes(saved(), { putFails: true });
  const out = await makeHandler(f.deps)({ templateId: 'T1', cbId: 'CB1' });
  assert.deepEqual(out, { ok: false });
  assert.equal(f.db.item.exportHistory[1].processStatus, 'failed');
  assert.match(f.db.item.exportHistory[1].error, /Could not render/);
  assert.doesNotMatch(f.db.item.exportHistory[1].error, /S3 down|secret/);
});

test('handler: bad input, a missing template, a deleted export entry and a failing status write never throw', async () => {
  assert.deepEqual(await makeHandler(fakes(null).deps)({}), { ok: false });
  assert.deepEqual(await makeHandler(fakes(null).deps)({ templateId: 'NOPE', cbId: 'x' }), { ok: false });
  const gone = fakes(saved());
  assert.equal((await makeHandler(gone.deps)({ templateId: 'T1', cbId: 'DELETED' })).ok, true); // rendered; nothing to update
  assert.equal(gone.log.updates.length, 0);
  const bad = fakes(saved(), { updateFails: true });
  assert.deepEqual(await makeHandler(bad.deps)({ templateId: 'T1', cbId: 'CB1' }), { ok: false }); // update failed -> marked failed attempt also fails -> still no throw
});
