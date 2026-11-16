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

// ---- form data: precedence, pipes, repeat / if / repeating tables ---------------------------------
const FD = {
  data: { full_name: 'Ann Lee', kind: 'Company', pep: false, joined: '2024-08-08', services: ['Alpha', 'Beta'], country: 'SG', checks: { q1: true, q2: false },
    owners: [{ name: 'Xavier', pct: 60, role: 'Director' }, { name: 'Yin', pct: 40 }] },
  raw: { full_name: 'Ann Lee', kind: 'co', pep: false, owners: [{ name: 'Xavier', pct: 60, role: 'dir' }, { name: 'Yin', pct: 40 }] },
};
const textFor = async (list, extra = {}, values = {}, fd = FD) => textOf((await unzip(render(tpl(list, extra), values, fd))).doc);
const line = (...ops) => rich([...ops, { insert: '\n' }]);

test('form data: precedence is this export\'s values, then the form, then the saved placeholders, then the chip\'s own value', async () => {
  const list = [line(ph('FULL_NAME'), { insert: ' / ' }, ph('CITY', 'Embed'), { insert: ' / ' }, ph('PLAN'), { insert: ' / ' }, ph('NOPE'))];
  assert.match(await textFor(list, { placeholders: { FULL_NAME: 'Saved', PLAN: 'Saved plan', CITY: 'Saved city' } }), /Ann Lee\| \/ \|Saved city\| \/ \|Saved plan\| \/ \|\{\{NOPE\}\}/);
  assert.match(await textFor(list, {}, { full_name: 'Override' }), /Override/);
  assert.match(await textFor([line(ph('CITY', 'Embed'))]), /Embed/);
});

test('pipes: yesno, check, date, upper, lower, list, country, chaining, unknown ignored', async () => {
  const t = await textFor([line(ph('pep|yesno'), { insert: ';' }, ph('pep|check'), { insert: ';' }, ph('joined|date'), { insert: ';' }, ph('full_name|upper'), { insert: ';' },
    ph('kind|lower'), { insert: ';' }, ph('services|list'), { insert: ';' }, ph('country|country'), { insert: ';' }, ph('full_name|nonsense|upper'), { insert: ';' }, ph('checks.q1|yesno'), { insert: ';' }, ph('checks.q2|check'))]);
  assert.ok(t.includes('☐ YES   ☒ NO'));
  assert.ok(t.includes('☐|;')); // pep false -> ☐
  assert.ok(t.includes('08 AUG 2024'));
  assert.ok(t.includes('ANN LEE'));
  assert.ok(t.includes('company'));
  assert.ok(t.includes('Alpha, Beta'));
  assert.ok(t.includes('Singapore'));
  assert.ok(t.includes('☒ YES   ☐ NO')); // checks.q1
  assert.ok(!t.includes('{{'));
});

test('pipes work in typed {{key|pipe}} text too, and an unresolved chip keeps its pipe visible', async () => {
  const t = await textFor([para('Born {{joined|date}}, PEP: {{pep|check}}, {{missing|yesno}}')]);
  assert.match(t, /Born 08 AUG 2024, PEP: ☐, \{\{missing\|yesno\}\}/);
  assert.match(await textFor([line(ph('missing|yesno'))]), /\{\{MISSING\|yesno\}\}/);
});

test('repeat: once per row, group.field and group.# read the row, zero rows renders nothing', async () => {
  const block = { id: 'r', type: 'repeat', item: { group: 'owners', list: [line(ph('owners.#'), { insert: '. ' }, ph('owners.name'), { insert: ' ' }, ph('owners.pct'), { insert: '% ' }, ph('owners.role'), { insert: ' for ' }, ph('full_name'))] } };
  assert.match(await textFor([para('Start'), block, para('End')]), /Start\|1\|\. \|Xavier\| \|60\|% \|Director\| for \|Ann Lee\|2\|\. \|Yin\| \|40\|% \| for \|Ann Lee\|End/); // Yin has no role: empty, not highlighted
  assert.ok(!(await textFor([block], {}, {}, { data: { owners: [] }, raw: {} })).includes('Xavier'));
  assert.equal(await textFor([block], {}, {}, { data: {}, raw: {} }), '');
  assert.ok(!(await textFor([block])).includes('{{'));
});

test('repeat: a numbered list inside restarts for each row; a one-item list still numbers every row', async () => {
  const li = (txt) => ({ id: 'li', type: 'list-item-paragraph', item: { delta: { ops: [{ insert: `${txt}\n` }] } } });
  const block = { id: 'r', type: 'repeat', item: { group: 'owners', list: [{ id: 'l', type: 'list', item: [li('Only')] }] } };
  const xml = (await unzip(render(tpl([block]), {}, FD))).doc;
  assert.equal((xml.match(/<w:numPr>/g) || []).length, 2); // both rows are numbered list items, not continuations
  const insts = [...xml.matchAll(/<w:numId w:val="(\d+)"/g)].map((m) => m[1]);
  assert.notEqual(insts[0], insts[1]); // each row is its own list instance, so numbering restarts
});

test('if: shows its blocks only when the condition holds; inside a repeat it sees the row first', async () => {
  const yes = { id: 'a', type: 'if', item: { cond: { key: 'kind', op: 'eq', value: 'co' }, list: [para('IS COMPANY')] } };
  const no = { id: 'b', type: 'if', item: { cond: { key: 'kind', op: 'eq', value: 'ind' }, list: [para('IS INDIVIDUAL')] } };
  const t = await textFor([yes, no]);
  assert.ok(t.includes('IS COMPANY') && !t.includes('IS INDIVIDUAL'));
  const inRepeat = { id: 'r', type: 'repeat', item: { group: 'owners', list: [{ id: 'c', type: 'if', item: { cond: { key: 'role', op: 'eq', value: 'dir' }, list: [line(ph('owners.name'), { insert: ' is a director' })] } }] } };
  const t2 = await textFor([inRepeat]);
  assert.ok(t2.includes('Xavier') && t2.includes('is a director') && !t2.includes('Yin'));
});

test('tables with repeatGroup repeat the first data row per group row; other rows stay; table-02 numbers them', async () => {
  const c = (...ops) => ({ text: '', delta: { ops: [...ops, { insert: '\n' }] } });
  const t03 = { id: 't', type: 'table-03', item: { repeatGroup: 'owners', data: [{ col1: c(ph('owners.name')), col2: c(ph('owners.pct')), col3: c({ insert: 'row' }) }, { col1: c({ insert: 'TOTAL' }), col2: c({ insert: '100' }), col3: c({ insert: '' }) }] } };
  assert.match(await textFor([t03]), /Xavier\|60\|row\|Yin\|40\|row\|TOTAL\|100/);
  const t02 = { id: 'u', type: 'table-02', item: { repeatGroup: 'owners', data: [{ col1: c(ph('owners.name')), col2: c(ph('owners.pct|upper')) }] } };
  assert.match(await textFor([t02]), /1\.\|Xavier\|:\|60\|2\.\|Yin\|:\|40/);
  const none = await textFor([t03], {}, {}, { data: { owners: [] }, raw: {} });
  assert.ok(none.includes('TOTAL') && !none.includes('Xavier'));
  const plain = { id: 'p', type: 'table-01', item: { data: [{ col1: c({ insert: 'A' }), col2: c(ph('full_name')) }] } };
  assert.match(await textFor([plain]), /A\|:\|Ann Lee/); // without repeatGroup: as before
});

test('header and signature blocks resolve form fields and repeat rows too; unknown containers are skipped', async () => {
  const sign = { id: 's', type: 'repeat', item: { group: 'owners', list: [{ id: 'h', type: 'sign-area-02', item: { data: { name: '{{owners.name|upper}}', desc: 'Owner {{owners.#}}' } } }] } };
  const t = await textFor([{ id: 'h', type: 'layout-company-header-01', item: { data: { companyName: '{{full_name}}', companyRegNo: '{{kind}}', subHeader: 'X' } } }, sign, { id: 'z', type: 'mystery', item: { list: [para('NO')] } }, { id: 'y', type: 'repeat', item: {} }]);
  assert.ok(t.includes('Ann Lee') && t.includes('Company') && t.includes('XAVIER') && t.includes('Owner 1') && t.includes('Owner 2') && t.includes('YIN'));
  assert.ok(!t.includes('NO'));
});

test('an unanswered field of the bound form prints "-", a chip pointing at nothing stays highlighted', async () => {
  const doc = render(tpl([para('x'), rich([{ insert: 'A: ' }, ph('remarks'), { insert: ' B: ' }, ph('checks.q1|yesno'), { insert: ' C: ' }, ph('typo_key'), { insert: '\n' }])]), {}, { data: { full_name: 'Ann' }, raw: {}, keys: ['full_name', 'remarks', 'checks'] });
  const text = textOf((await unzip(doc)).doc);
  assert.ok(text.includes('A: |-| B: |-| C: '), text);
  assert.ok(text.includes('{{TYPO_KEY}}'));
  assert.ok(!text.includes('{{REMARKS}}') && !text.includes('{{CHECKS'));
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

// ---- handler: submissions ----------------------------------------------------------------------
const multiFakes = (items, { putFails = false } = {}) => {
  const db = JSON.parse(JSON.stringify(items));
  const log = { puts: [], updates: [], gets: [] };
  const deps = {
    getItem: async (t, Key) => { log.gets.push(Key.pk); return db[Key.pk] ? JSON.parse(JSON.stringify(db[Key.pk])) : null; },
    putObject: async (p) => { if (putFails) throw new Error('S3 down: secret'); log.puts.push(p); },
    updateItem: async (p) => {
      log.updates.push(p);
      const idx = Number(/#h\[(\d+)\]/.exec(p.ConditionExpression)[1]);
      const item = db[p.Key.pk];
      assert.equal(item.exportHistory[idx].cbId, p.ExpressionAttributeValues[':cb']);
      for (const [k, name] of Object.entries(p.ExpressionAttributeNames)) if (k !== '#h') item.exportHistory[idx][name] = p.ExpressionAttributeValues[k.replace('#f', ':v')];
    },
  };
  return { db, log, deps };
};
const FORM_SCHEMA = { sections: [{ id: 's1', title: 'C', fields: [
  { id: 'a', key: 'full_name', type: 'text', label: 'Name' },
  { id: 'b', key: 'kind', type: 'select', label: 'Kind', options: [{ value: 'ind', label: 'Individual' }, { value: 'co', label: 'Company' }] },
  { id: 'c', key: 'owners', type: 'group', label: 'Owners', group: { fields: [{ id: 'd', key: 'name', type: 'text', label: 'Name' }] } },
] }] };
const subItems = (over = {}) => ({
  '#SUBMISSION:S1': { pk: '#SUBMISSION:S1', id: 'S1', accountId: 'A1', formId: 'F1', schema: FORM_SCHEMA, values: { full_name: 'Ann', kind: 'co', owners: [{ name: 'Xavier' }, { name: 'Yin' }] },
    exportHistory: [{ cbId: 'CB1', processStatus: 'processing' }], ...over.sub },
  '#FORM:F1': { pk: '#FORM:F1', id: 'F1', accountId: 'A1', templateId: 'T1', ...over.form },
  '#TEMPLATE:T1': { pk: '#TEMPLATE:T1', id: 'T1', accountId: 'A1', name: 'CDD', placeholders: {},
    section: [{ name: 's', list: [rich([{ insert: 'Customer ' }, ph('full_name'), { insert: ' (' }, ph('kind'), { insert: ')\n' }]), { id: 'r', type: 'repeat', item: { group: 'owners', list: [rich([ph('owners.#'), { insert: ' ' }, ph('owners.name'), { insert: '\n' }])] } }] }], ...over.template },
});

test('handler (submission): renders the form\'s template with the answers, stores under records/, completes the submission\'s entry', async () => {
  process.env.TABLE = 'tbl'; process.env.BUCKET = 'bkt';
  const f = multiFakes(subItems());
  const out = await makeHandler(f.deps)({ submissionId: 'S1', cbId: 'CB1' });
  assert.deepEqual(out, { ok: true, path: 'accounts/A1/records/S1/exports/CB1.docx' });
  assert.equal(f.log.puts[0].Key, 'accounts/A1/records/S1/exports/CB1.docx');
  const z = await JSZip.loadAsync(f.log.puts[0].Body);
  const text = textOf(await z.files['word/document.xml'].async('string'));
  assert.match(text, /Customer \|Ann\| \(\|Company\|\)/); // select shown as its label
  assert.match(text, /1\| \|Xavier\|2\| \|Yin/);
  assert.equal(f.db['#SUBMISSION:S1'].exportHistory[0].processStatus, 'completed');
  assert.equal(f.db['#SUBMISSION:S1'].exportHistory[0].path, 'accounts/A1/records/S1/exports/CB1.docx');
  assert.equal(f.log.updates[0].Key.pk, '#SUBMISSION:S1');
});

test('handler (submission): this export\'s values override the answers', async () => {
  const f = multiFakes(subItems());
  await makeHandler(f.deps)({ submissionId: 'S1', cbId: 'CB1', values: { FULL_NAME: 'Override' } });
  const z = await JSZip.loadAsync(f.log.puts[0].Body);
  assert.match(textOf(await z.files['word/document.xml'].async('string')), /Customer \|Override/);
});

test('handler (submission): no template, a missing or another account\'s template, or a failing upload mark the entry failed with a safe message', async () => {
  const none = multiFakes(subItems({ form: { templateId: undefined } }));
  assert.deepEqual(await makeHandler(none.deps)({ submissionId: 'S1', cbId: 'CB1' }), { ok: false });
  assert.equal(none.db['#SUBMISSION:S1'].exportHistory[0].processStatus, 'failed');
  assert.match(none.db['#SUBMISSION:S1'].exportHistory[0].error, /no document template/);
  assert.equal(none.log.puts.length, 0);

  const gone = multiFakes(subItems({ form: { templateId: 'MISSING' } }));
  await makeHandler(gone.deps)({ submissionId: 'S1', cbId: 'CB1' });
  assert.match(gone.db['#SUBMISSION:S1'].exportHistory[0].error, /isn't available/);

  const other = multiFakes(subItems({ template: { accountId: 'SOMEONE_ELSE' } }));
  await makeHandler(other.deps)({ submissionId: 'S1', cbId: 'CB1' });
  assert.equal(other.db['#SUBMISSION:S1'].exportHistory[0].processStatus, 'failed');
  assert.equal(other.log.puts.length, 0);

  const down = multiFakes(subItems(), { putFails: true });
  assert.deepEqual(await makeHandler(down.deps)({ submissionId: 'S1', cbId: 'CB1' }), { ok: false });
  assert.match(down.db['#SUBMISSION:S1'].exportHistory[0].error, /Could not render/);
  assert.doesNotMatch(down.db['#SUBMISSION:S1'].exportHistory[0].error, /S3 down|secret/);
});

test('handler (submission): a missing submission does not throw', async () => {
  assert.deepEqual(await makeHandler(multiFakes({}).deps)({ submissionId: 'NOPE', cbId: 'x' }), { ok: false });
});

// ---- corpsec CDD format: style "form", page frame, form-table, form-checklist, form-declaration -----
// Tables are read back out of the XML as { rows: [[{ span, pct, text, xml }]] } so the layout is asserted,
// not just the words. Check boxes read as ☒ / ☐ and line breaks as ↵ in a cell's text.
const cellText = (xml) =>
  xml
    .replace(/<w:sdt>(?:(?!<\/w:sdt>)[\s\S])*?<w14:checked w14:val="1"\/>(?:(?!<\/w:sdt>)[\s\S])*?<\/w:sdt>/g, '☒')
    .replace(/<w:sdt>(?:(?!<\/w:sdt>)[\s\S])*?<w14:checked w14:val="0"\/>(?:(?!<\/w:sdt>)[\s\S])*?<\/w:sdt>/g, '☐')
    .replace(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/g, '{$1}') // a Word field
    .replace(/<w:br\/>/g, '↵')
    .replace(/<\/w:p>/g, '¶')
    .replace(/<[^>]+>/g, '');
const tablesOf = (xml) =>
  [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map((t) => ({
    xml: t[1],
    rows: [...t[1].matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)].map((r) => ({
      xml: r[1],
      cells: [...r[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) => ({
        xml: c[1],
        span: Number((/<w:gridSpan w:val="(\d+)"/.exec(c[1]) || [])[1] || 1),
        pct: (/<w:tcW w:type="pct" w:w="([\d.]+)%"/.exec(c[1]) || [])[1],
        text: cellText(c[1]),
      })),
    })),
  }));
const grid = (tables) => tables.map((t) => t.rows.map((r) => r.cells.map((c) => c.text)));
const fd = (data, keys = Object.keys(data), raw = data) => ({ data, raw, keys });
const formTbl = (item, id = 'ft') => ({ id, type: 'form-table', item });
const checklist = (item, id = 'cl') => ({ id, type: 'form-checklist', item });
const decl = (item = {}, id = 'dc') => ({ id, type: 'form-declaration', item });
const body = async (doc) => (await unzip(doc)).doc;

test('style "form": Calibri, 12.7 mm margins, grey F2F2F2 table header; "letter" stays Arial / 20 mm / white', async () => {
  const list = [formTbl({ title: 'Customer', rows: [{ cells: [{ label: 'Name', value: 'x' }] }] })];
  const form = await unzip(render(tpl(list, { style: 'form' }), {}));
  assert.ok(form.doc.includes('w:ascii="Calibri"') && !form.doc.includes('Arial'));
  assert.ok(/<w:pgMar[^>]*w:left="720"/.test(form.doc), 'A4 with 12.7 mm = 720 twips');
  assert.equal(tablesOf(form.doc)[0].rows[0].cells[0].xml.includes('w:fill="F2F2F2"'), true);
  const letter = await unzip(render(tpl(list), {}));
  assert.ok(letter.doc.includes('w:ascii="Arial"') && !letter.doc.includes('Calibri'));
  assert.ok(/<w:pgMar[^>]*w:left="1133"/.test(letter.doc));
  assert.equal(tablesOf(letter.doc)[0].rows[0].cells[0].xml.includes('F2F2F2'), false);
  const unknown = await unzip(render(tpl(list, { style: 'nonsense' }), {}));
  assert.ok(unknown.doc.includes('Arial')); // anything else is "letter"
});

test('frame: the corpsec header (two shaded cells) and footer (Page N/M of the section) on every Word section', async () => {
  const t = {
    name: 'T', style: 'form', placeholders: {}, frame: { headerLeft: 'Customer Due Diligence Form', headerRight: 'Case Reference: {{submission_ref}}', footerLeft: 'Acme Advisory Pte Ltd' },
    section: [{ name: 'one', list: [para('first')] }, { name: 'two', list: [para('second')] }],
  };
  const r = await unzip(render(t, { submission_ref: 'AB12CD34' }));
  const headers = Object.keys(r.files).filter((n) => /word\/header\d+\.xml/.test(n));
  const footers = Object.keys(r.files).filter((n) => /word\/footer\d+\.xml/.test(n));
  assert.equal(headers.length, 2); // one per Word section
  assert.equal(footers.length, 2);
  assert.equal((r.doc.match(/<w:headerReference/g) || []).length, 2);
  assert.equal((r.doc.match(/<w:footerReference/g) || []).length, 2);
  assert.equal((r.doc.match(/<w:pgNumType w:start="1"/g) || []).length, 2, 'numbering restarts per section');
  for (const h of headers) {
    const [tb] = tablesOf(r.files[h]);
    assert.equal(tb.rows[0].cells.length, 2);
    assert.deepEqual(tb.rows[0].cells.map((c) => c.text), ['Customer Due Diligence Form¶', 'Case Reference: AB12CD34¶']);
    assert.deepEqual(tb.rows[0].cells.map((c) => c.pct), ['50', '50']);
    assert.ok(tb.rows[0].cells.every((c) => c.xml.includes('w:fill="F2F2F2"')));
    assert.ok(tb.rows[0].cells.every((c) => !c.xml.includes('w:val="single"')), 'no borders');
  }
  for (const f of footers) {
    const x = r.files[f];
    const [tb] = tablesOf(x);
    assert.equal(tb.rows[0].cells[0].text, 'Acme Advisory Pte Ltd¶');
    assert.equal(tb.rows[0].cells[1].text, 'Page {PAGE}/{SECTIONPAGES}¶'); // current page / pages in THIS section, as Word fields
    assert.ok(tb.rows[0].cells[1].xml.includes('w:jc w:val="right"'));
    assert.ok(x.indexOf('<w:tbl>') > x.indexOf('<w:p>'), 'an empty line comes first');
  }
});

test('frame: unset or all-blank adds nothing; with a frame page-break-02 keeps the frame, without one it keeps its own "-N-" header', async () => {
  const list = [para('a'), { id: 'pb', type: 'page-break-02', item: { data: { headerPageNo: '2', footerPageNo: '2' } } }, para('b')];
  const plain = await unzip(render(tpl(list, { frame: { headerLeft: '  ', headerRight: '', footerLeft: '' } }), {}));
  assert.ok(plain.all.includes('-2-') && plain.all.includes('.../2'));
  const framed = await unzip(render(tpl(list, { frame: { headerLeft: 'Left', footerLeft: 'Foot' } }), {}));
  assert.equal(Object.keys(framed.files).filter((n) => /word\/header\d+\.xml/.test(n)).length, 2); // page-break-02 still starts a new Word section
  assert.ok(!framed.all.includes('-2-') && !framed.all.includes('.../2'));
  assert.ok(framed.all.includes('Left') && framed.all.includes('Foot'));
  const none = await unzip(render(tpl([para('a')]), {}));
  assert.ok(!/word\/header\d+\.xml/.test(Object.keys(none.files).join()));
});

test('built-in values: generated_date is today, the caller wins, and frame strings can use them', async () => {
  const doc = render(tpl([rich([ph('generated_date'), { insert: ' | ' }, ph('submission_ref'), { insert: ' | ' }, ph('form_name'), { insert: '\n' }])], { frame: { headerRight: '{{submission_title}}' } }), { submission_ref: 'REF1', submission_title: 'Acme CDD' });
  const r = await unzip(doc);
  const t = textOf(r.doc);
  assert.match(t, /^\d{2} [A-Z]{3} \d{4}\| \| \|REF1/);
  assert.ok(t.includes('{{FORM_NAME}}'), 'a built-in nobody provided stays visible as a placeholder');
  assert.ok(r.all.includes('Acme CDD'));
  const own = textOf((await unzip(render(tpl([rich([ph('generated_date'), { insert: '\n' }])]), { generated_date: '01 JAN 2030' }))).doc);
  assert.equal(own, '01 JAN 2030');
});

test('handler (submission): passes submission_ref / submission_title / form_name, and the caller\'s values win', async () => {
  process.env.TABLE = 'tbl'; process.env.BUCKET = 'bkt';
  const items = subItems({ sub: { title: 'Acme CDD', formName: 'CDD: Individual' } });
  items['#TEMPLATE:T1'].frame = { headerLeft: 'Form {{form_name}}', headerRight: 'Ref {{submission_ref}}', footerLeft: '{{submission_title}}' };
  items['#TEMPLATE:T1'].section = [{ name: 's', list: [rich([ph('submission_ref'), { insert: '\n' }])] }];
  const f = multiFakes(items);
  await makeHandler(f.deps)({ submissionId: 'S1', cbId: 'CB1' });
  const z = await JSZip.loadAsync(f.log.puts[0].Body);
  const all = (await Promise.all(Object.values(z.files).filter((x) => x.name.endsWith('.xml')).map((x) => x.async('string')))).join('\n');
  assert.equal(textOf(await z.files['word/document.xml'].async('string')), 'S1');
  assert.ok(all.includes('Form CDD: Individual') && all.includes('Ref S1') && all.includes('Acme CDD'));
  const g = multiFakes(items);
  await makeHandler(g.deps)({ submissionId: 'S1', cbId: 'CB1', values: { submission_ref: 'CUSTOM' } });
  const z2 = await JSZip.loadAsync(g.log.puts[0].Body);
  assert.equal(textOf(await z2.files['word/document.xml'].async('string')), 'CUSTOM');
});

test('form-table: shaded title row, label-over-bold-value cells, 6/6 for two, full width for one, 4/4/4 for three, col overrides', async () => {
  const doc = render(
    tpl([formTbl({ title: 'Customer Information', rows: [
      { cells: [{ label: 'Full Name', value: '{{full_name|upper}}' }, { label: 'Gender', value: '{{gender}}' }] },
      { cells: [{ label: 'Address', value: '{{address}}' }] },
      { cells: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }, { label: 'C', value: '3' }] },
      { cells: [{ label: 'Wide', value: 'w', col: 8 }, { label: 'Narrow', value: 'n', col: 4 }] },
      { cells: [{ value: 'bare value' }] },
    ] })], { style: 'form' }),
    {}, fd({ full_name: 'Ann Lee', gender: 'Female', address: '1 Example Road' })
  );
  const [t] = tablesOf(await body(doc));
  assert.equal(t.rows.length, 6);
  assert.equal(t.rows[0].cells.length, 1);
  assert.equal(t.rows[0].cells[0].text, 'Customer Information¶');
  assert.equal(t.rows[0].cells[0].span, 12);
  assert.ok(t.rows[0].cells[0].xml.includes('w:fill="F2F2F2"'));
  // label small, line break, 8 spaces, bold value (the reference's p([span_sm(label), br(), t(), b(value)]))
  assert.equal(t.rows[1].cells[0].text, 'Full Name↵        ANN LEE¶');
  assert.ok(t.rows[1].cells[0].xml.includes('<w:sz w:val="15"/>'), 'the label is the small size');
  assert.ok(/<w:b\/>[\s\S]*ANN LEE/.test(t.rows[1].cells[0].xml), 'the value is bold');
  assert.deepEqual(t.rows[1].cells.map((c) => c.pct), ['50', '50']);
  assert.deepEqual(t.rows[1].cells.map((c) => c.span), [6, 6]);
  assert.deepEqual(t.rows[2].cells.map((c) => c.pct), ['100']);
  assert.deepEqual(t.rows[3].cells.map((c) => Number(c.pct).toFixed(1)), ['33.3', '33.3', '33.3']);
  assert.deepEqual(t.rows[4].cells.map((c) => c.span), [8, 4]);
  assert.equal(t.rows[5].cells[0].text, 'bare value¶');
  assert.ok(!t.rows[5].cells[0].text.includes('↵'));
  assert.ok(t.rows[1].cells[0].xml.includes('w:val="single"'), 'body cells are bordered');
  assert.ok(/<w:tcMar><w:top w:type="dxa" w:w="4"\/><w:left w:type="dxa" w:w="140"\/>/.test(t.rows[1].cells[0].xml));
});

test('form-table: pipes apply, empty prints "-", a typo\'d chip stays visible, numbers and odd values never crash', async () => {
  const doc = render(
    tpl([formTbl({ title: 'T', rows: [
      { cells: [{ label: 'DOB', value: '{{dob|date}}' }, { label: 'Country', value: '{{nat|country}}' }] },
      { cells: [{ label: 'Remarks', value: '{{remarks}}' }, { label: 'Blank', value: '' }] },
      { cells: [{ label: 'Typo', value: '{{no_such_key}}' }, { label: 'Num', value: 42 }] },
      { cells: [{ label: 'Null', value: null }] },
    ] })]),
    {}, fd({ dob: '1990-08-03', nat: 'SG', remarks: undefined }, ['dob', 'nat', 'remarks'])
  );
  const [t] = tablesOf(await body(doc));
  assert.equal(t.rows[1].cells[0].text, 'DOB↵        03 AUG 1990¶');
  assert.equal(t.rows[1].cells[1].text, 'Country↵        Singapore¶');
  assert.equal(t.rows[2].cells[0].text, 'Remarks↵        -¶');
  assert.equal(t.rows[2].cells[1].text, 'Blank↵        -¶');
  assert.equal(t.rows[3].cells[0].text, 'Typo↵        {{no_such_key}}¶');
  assert.equal(t.rows[3].cells[1].text, 'Num↵        42¶');
  assert.equal(t.rows[4].cells[0].text, 'Null↵        -¶');
});

test('form-table: list cells are numbered, bold, UPPER CASE, restart per table, "-" when empty; stack shares one cell', async () => {
  const data = { services: ['Buying of precious stones.', 'Selling of property.'], remarks: 'Walk-in', none: [] };
  const mk = (rows, id) => formTbl({ title: 'Case Information', rows }, id);
  const doc = render(
    tpl([
      mk([{ stack: true, cells: [{ label: 'Nature of Services Provided', value: '{{services}}', list: true }, { label: 'Remarks', value: '{{remarks}}' }] }], 'a'),
      mk([{ cells: [{ label: 'Services', value: '{{services}}', list: true }, { label: 'None', value: '{{none}}', list: true }] }], 'b'),
    ], { style: 'form' }),
    {}, fd(data, ['services', 'remarks', 'none'])
  );
  const [a, b] = tablesOf(await body(doc));
  // stack: ONE cell (full width) holding label, numbered items, a spacer line, the next label and the value
  assert.equal(a.rows[1].cells.length, 1);
  assert.equal(a.rows[1].cells[0].span, 12);
  assert.equal(a.rows[1].cells[0].text, 'Nature of Services Provided¶BUYING OF PRECIOUS STONES.¶SELLING OF PROPERTY.¶↵Remarks¶Walk-in¶');
  const numIds = (x) => [...x.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]);
  const na = numIds(a.rows[1].cells[0].xml);
  assert.equal(na.length, 2);
  assert.equal(new Set(na).size, 1, 'one list');
  assert.ok(/<w:b\/>/.test(a.rows[1].cells[0].xml));
  // second table: its own list instance, so numbering restarts at 1; an empty list prints "-"
  assert.deepEqual(b.rows[1].cells.map((c) => c.text), ['Services¶BUYING OF PRECIOUS STONES.¶SELLING OF PROPERTY.¶', 'None¶-¶'.replace('¶-¶', '¶-¶')]);
  assert.notEqual(numIds(b.rows[1].cells[0].xml)[0], na[0]);
});

test('form-table: head cells are column titles (small, not bold, no label, no "-"), over rows of bold values with explicit col widths', async () => {
  const holders = [{ type: 'Individual', name: 'A One', id: 'S123', cls: 'Ordinary', pct: 60 }, { type: 'Company', name: 'B Holdings', id: '2009X', cls: 'Ordinary', pct: 40 }];
  const doc = render(
    tpl([formTbl({ title: 'Shareholders Information', rows: [
      { cells: [{ head: true, value: 'Type', col: 1 }, { head: true, value: 'Name', col: 5 }, { head: true, value: 'Id / Register No.', col: 2 }, { head: true, value: '{{cls_title}}', col: 2 }, { head: true, value: '', col: 2 }] },
      { repeat: 'holders', cells: [{ value: '{{holders.type|upper}}', col: 1 }, { value: '{{holders.name}}', col: 5 }, { value: '{{holders.id}}', col: 2 }, { value: '{{holders.cls}}', col: 2 }, { value: '{{holders.pct}}', col: 2 }] },
    ] })], { style: 'form', placeholders: { cls_title: 'Share Type' } }),
    {}, fd({ holders }, ['holders'])
  );
  const [t] = tablesOf(await body(doc));
  assert.equal(t.rows.length, 4); // title, column titles, two data rows
  const heads = t.rows[1].cells;
  assert.deepEqual(heads.map((c) => c.text), ['Type¶', 'Name¶', 'Id / Register No.¶', 'Share Type¶', '¶']); // substituted; empty stays empty, not "-"
  assert.deepEqual(heads.map((c) => c.span), [1, 5, 2, 2, 2]);
  assert.deepEqual(heads.map((c) => Number(c.pct).toFixed(2)), ['8.33', '41.67', '16.67', '16.67', '16.67']);
  assert.ok(heads.every((c) => c.xml.includes('<w:sz w:val="15"/>') && !c.xml.includes('<w:b/>')), 'small and not bold');
  assert.ok(heads.every((c) => !c.text.includes('↵')), 'no label line');
  assert.deepEqual(t.rows[2].cells.map((c) => c.text), ['INDIVIDUAL¶', 'A One¶', 'S123¶', 'Ordinary¶', '60¶']);
  assert.deepEqual(t.rows[3].cells.map((c) => c.span), [1, 5, 2, 2, 2]);
  assert.ok(t.rows[2].cells.every((c) => c.xml.includes('<w:b/>')), 'the data values are bold');
});

test('form-table: repeat rows one per group row (zero rows keeps just the header), inside a repeat container, with numbering', async () => {
  const owners = [{ name: 'A One', pct: 60 }, { name: 'B Two', pct: 40 }];
  const rowDef = { repeat: 'owners', cells: [{ label: 'Name', value: '{{owners.name}}' }, { label: 'Share %', value: '{{owners.pct}}' }] };
  const doc = render(tpl([formTbl({ title: 'Shareholders', rows: [rowDef, { cells: [{ label: 'Total', value: 'x' }] }] })]), {}, fd({ owners }, ['owners']));
  const [t] = tablesOf(await body(doc));
  assert.equal(t.rows.length, 4);
  assert.deepEqual(t.rows.slice(1, 3).map((r) => r.cells.map((c) => c.text)), [['Name↵        A One¶', 'Share %↵        60¶'], ['Name↵        B Two¶', 'Share %↵        40¶']]);
  assert.equal(t.rows[3].cells[0].text, 'Total↵        x¶');
  const empty = tablesOf(await body(render(tpl([formTbl({ title: 'Shareholders', rows: [rowDef] })]), {}, fd({ owners: [] }, ['owners']))));
  assert.equal(empty[0].rows.length, 1);
  assert.equal(empty[0].rows[0].cells[0].text, 'Shareholders¶');
  // a whole table per row inside a repeat container, reading the row; {{owners.#}} is the row number
  const nested = render(tpl([{ id: 'r', type: 'repeat', item: { group: 'owners', list: [formTbl({ title: 'Owner {{owners.#}}', rows: [{ cells: [{ label: 'Name', value: '{{owners.name}}' }] }] })] } }]), {}, fd({ owners }, ['owners']));
  const nt = tablesOf(await body(nested));
  assert.deepEqual(grid(nt), [[['Owner 1¶'], ['Name↵        A One¶']], [['Owner 2¶'], ['Name↵        B Two¶']]]);
});

test('form-checklist: title, subtitle, a thin spacer row, numbered questions, 9/3 split with real check boxes', async () => {
  const doc = render(
    tpl([checklist({ title: 'Risk Assessment Checklist', subtitle: 'Customer Risk Assessment', rows: [
      { text: 'Is there any match on the MHA list?', value: '{{checks.q1}}' },
      { text: 'Is the customer a PEP?', value: '{{checks.q2}}' },
      { text: 'Is the country on the FATF list?', value: '{{checks.q3}}' },
      { text: 'Static yes', value: 'yes' },
      { text: 'Static false', value: 'false' },
    ] })], { style: 'form' }),
    {}, fd({ checks: { q1: false, q2: true } }, ['checks'])
  );
  const [t] = tablesOf(await body(doc));
  assert.equal(t.rows.length, 3 + 5); // title, subtitle, spacer, five questions
  assert.equal(t.rows[0].cells[0].text, 'Risk Assessment Checklist¶');
  assert.ok(t.rows[0].cells[0].xml.includes('w:fill="F2F2F2"'));
  assert.equal(t.rows[1].cells[0].text, 'Customer Risk Assessment¶');
  assert.ok(t.rows[1].cells[0].xml.includes('<w:sz w:val="15"/>'), 'subtitle is the small size');
  assert.ok(t.rows[2].xml.includes('w:val="50"') && t.rows[2].xml.includes('w:hRule="exact"'), 'spacer row is a 50-twip strip');
  const q = t.rows.slice(3);
  assert.deepEqual(q.map((r) => r.cells[0].text), ['Is there any match on the MHA list?¶', 'Is the customer a PEP?¶', 'Is the country on the FATF list?¶', 'Static yes¶', 'Static false¶']);
  // 9/12 + 3/12, question cell open on the right, answer cell open on the left (the reference's borders)
  assert.deepEqual(q[0].cells.map((c) => c.span), [9, 3]);
  assert.deepEqual(q[0].cells.map((c) => c.pct), ['75', '25']);
  assert.ok(q[0].cells[0].xml.includes('<w:right w:val="nil"/>'));
  assert.ok(q[0].cells[1].xml.includes('<w:left w:val="nil"/>'));
  assert.ok(q[0].cells[1].xml.includes('w:jc w:val="right"'));
  assert.ok(q.every((r) => r.xml.includes('<w:cantSplit/>')) && q.every((r) => r.xml.includes('w:val="800"')), 'rows do not split and are tall');
  // answers: false / true / unanswered / static
  assert.deepEqual(q.map((r) => r.cells[1].text), ['☐ YES   ☒ NO¶', '☒ YES   ☐ NO¶', '☐ YES   ☐ NO¶', '☒ YES   ☐ NO¶', '☐ YES   ☒ NO¶']);
  // the chosen answer is bold, the other is not
  const boldRuns = (x) => [...x.matchAll(/<w:r><w:rPr>(?:(?!<\/w:rPr>)[\s\S])*?<\/w:rPr><w:t xml:space="preserve">( (?:YES|NO))<\/w:t>/g)].map((m) => [m[1], /<w:b\/>/.test(m[0])]);
  assert.deepEqual(boldRuns(q[0].cells[1].xml), [[' YES', false], [' NO', true]]);
  assert.deepEqual(boldRuns(q[1].cells[1].xml), [[' YES', true], [' NO', false]]);
  assert.deepEqual(boldRuns(q[2].cells[1].xml), [[' YES', false], [' NO', false]]);
  // a numbered list: one list for the whole table
  const ids = q.map((r) => /<w:numId w:val="(\d+)"\/>/.exec(r.cells[0].xml)[1]);
  assert.equal(new Set(ids).size, 1);
});

test('form-checklist: numbering restarts per checklist; inside repeat/if it reads the row; odd rows are skipped', async () => {
  const cl = (id, key) => checklist({ title: id, rows: [{ text: 'One', value: `{{${key}.q1}}` }, null, 'oops', { text: 'Two', value: `{{${key}.q2}}` }] }, id);
  const doc = render(tpl([cl('first', 'a'), cl('second', 'b')]), {}, fd({ a: { q1: true, q2: true }, b: { q1: false, q2: false } }, ['a', 'b']));
  const [t1, t2] = tablesOf(await body(doc));
  assert.equal(t1.rows.length, 1 + 1 + 2); // title, spacer, two good questions
  const id1 = /<w:numId w:val="(\d+)"\/>/.exec(t1.rows[2].cells[0].xml)[1];
  const id2 = /<w:numId w:val="(\d+)"\/>/.exec(t2.rows[2].cells[0].xml)[1];
  assert.notEqual(id1, id2, 'each checklist is its own numbered list, so it restarts at 1');
  assert.deepEqual(t2.rows.slice(2).map((r) => r.cells[1].text), ['☐ YES   ☒ NO¶', '☐ YES   ☒ NO¶']);
  const rep = render(
    tpl([{ id: 'r', type: 'repeat', item: { group: 'owners', list: [checklist({ title: 'Owner {{owners.#}}', rows: [{ text: 'PEP?', value: '{{owners.pep}}' }] })] } }]),
    {}, fd({ owners: [{ name: 'A', pep: true }, { name: 'B', pep: false }] }, ['owners'])
  );
  const rt = tablesOf(await body(rep));
  assert.deepEqual(rt.map((t) => [t.rows[0].cells[0].text, t.rows[2].cells[1].text]), [['Owner 1¶', '☒ YES   ☐ NO¶'], ['Owner 2¶', '☐ YES   ☒ NO¶']]);
});

test('form-declaration: the corpsec declaration table (header, text, signature, name + date lines)', async () => {
  const [t] = tablesOf(await body(render(tpl([decl()], { style: 'form' }), {})));
  assert.equal(t.rows.length, 4);
  assert.ok(t.xml.includes('<w:tblHeader/>'), 'the Declaration header row repeats across pages');
  assert.equal(t.rows[0].cells[0].text, 'Declaration¶');
  assert.ok(t.rows[0].cells[0].xml.includes('w:fill="F2F2F2"'));
  assert.match(t.rows[1].cells[0].text, /^I declare that the information provided in this form is accurate and truthful\./);
  assert.ok(t.rows[1].cells[0].xml.includes('<w:bottom w:val="nil"/>'));
  assert.equal(t.rows[2].cells[0].text, 'Signature:¶↵↵¶');
  assert.ok(t.rows[2].cells[0].xml.includes('<w:top w:val="nil"/>') && t.rows[2].cells[0].xml.includes('<w:bottom w:val="nil"/>'));
  const last = t.rows[3].cells;
  assert.deepEqual(last.map((c) => c.span), [8, 4]);
  assert.equal(last[0].text, '__________________________________________¶Name of Officer/ Shareholder/ Beneficial Owner/↵Purchaser/ Customer¶');
  assert.equal(last[1].text, '__________________________________________¶Date¶');
  assert.ok(last[0].xml.includes('<w:right w:val="nil"/>') && last[1].xml.includes('<w:left w:val="nil"/>'));
});

test('form-declaration: custom text and labels; signer prints the name (underlined) instead of the blank line, only when it resolves', async () => {
  const item = { title: 'Customer declaration', text: 'I agree.', signatureLabel: 'Signed:', nameLabel: 'Customer name', dateLabel: 'Signed on', signer: '{{sig}}' };
  const [t] = tablesOf(await body(render(tpl([decl(item)]), {}, fd({ sig: 'Ann Lee' }))));
  assert.equal(t.rows[0].cells[0].text, 'Customer declaration¶');
  assert.equal(t.rows[1].cells[0].text, 'I agree.↵↵↵¶');
  assert.equal(t.rows[2].cells[0].text, 'Signed:¶↵↵¶');
  assert.equal(t.rows[3].cells[0].text, 'Ann Lee¶Customer name¶');
  assert.ok(/<w:u w:val="single"\/>/.test(t.rows[3].cells[0].xml));
  assert.equal(t.rows[3].cells[1].text, '__________________________________________¶Signed on¶');
  for (const data of [fd({}, ['sig']), fd({ other: 1 })]) {
    const [u] = tablesOf(await body(render(tpl([decl(item)]), {}, data)));
    assert.equal(u.rows[3].cells[0].text, '__________________________________________¶Customer name¶', 'unanswered or unknown signer leaves the line');
  }
});

test('the CDD blocks sit inside if containers, and malformed blocks are skipped, never fatal', async () => {
  const doc = render(
    tpl([
      { id: 'i', type: 'if', item: { cond: { key: 'show', op: 'eq', value: true }, list: [formTbl({ title: 'Shown', rows: [{ cells: [{ label: 'a', value: 'b' }] }] })] } },
      { id: 'h', type: 'if', item: { cond: { key: 'show', op: 'eq', value: false }, list: [formTbl({ title: 'Hidden', rows: [] })] } },
      { id: 'x1', type: 'form-table', item: null },
      { id: 'x2', type: 'form-table', item: { title: 'No rows', rows: 'nope' } },
      { id: 'x3', type: 'form-checklist', item: { title: 5, rows: 7 } },
      { id: 'x4', type: 'form-declaration' },
      formTbl({ title: 'Odd', rows: [null, { cells: 'x' }, { cells: [] }, { cells: [null, { value: 'ok' }] }, { repeat: 'nope', cells: [{ value: 'never' }] }] }, 'x5'),
    ]),
    {}, fd({ show: true }, ['show'])
  );
  const tables = tablesOf(await body(doc));
  const heads = tables.map((t) => t.rows[0].cells[0].text);
  assert.deepEqual(heads, ['Shown¶', 'No rows¶', '5¶', 'Declaration¶', 'Odd¶']);
  assert.deepEqual(tables[4].rows.slice(1).map((r) => r.cells.map((c) => c.text)), [['ok¶']]);
});

test('golden: a mini CDD with style "form" and a frame keeps its table structure', async () => {
  const t = {
    name: 'CDD', style: 'form', placeholders: { firm_name: 'Acme Advisory Pte Ltd' },
    frame: { headerLeft: 'Customer Due Diligence Form', headerRight: 'Case Reference: {{submission_ref}}', footerLeft: '{{firm_name}}' },
    section: [
      { name: 'Customer', list: [
        formTbl({ title: 'Customer Information', rows: [
          { cells: [{ label: 'Full Name', value: '{{full_name|upper}}' }, { label: 'Gender', value: '{{gender|upper}}' }] },
          { cells: [{ label: 'Identification No', value: '{{id_no}}' }, { label: 'Expiry Date of ID', value: '{{id_expiry|date}}' }] },
          { cells: [{ label: 'Address', value: '{{address}}' }] },
        ] }, 'g1'),
        formTbl({ title: 'Case Information', rows: [{ stack: true, cells: [{ label: 'Nature of Services Provided', value: '{{services}}', list: true }, { label: 'Remarks', value: '{{remarks}}' }] }] }, 'g2'),
        decl({ signer: '{{sign}}' }, 'g3'),
      ] },
      { name: 'Risk', list: [
        checklist({ title: 'Risk Assessment Checklist', subtitle: 'Customer Risk Assessment', rows: [
          { text: 'Is the customer a PEP?', value: '{{risk.q1}}' }, { text: 'Is the country on the FATF list?', value: '{{risk.q2}}' }, { text: 'Higher-risk profile?', value: '{{risk.q3}}' },
        ] }, 'g4'),
      ] },
    ],
  };
  const data = { full_name: 'Yoke How Loy', gender: 'Male', id_no: '123124123', id_expiry: '2024-08-08', address: undefined, services: ['Buying of precious stones.', 'Buying of precious metals.'], remarks: undefined, sign: 'Yoke How Loy', risk: { q1: false, q2: false } };
  const r = await unzip(render(t, { submission_ref: '123456' }, fd(data, ['full_name', 'gender', 'id_no', 'id_expiry', 'address', 'services', 'remarks', 'sign', 'risk'])));
  assert.deepEqual(grid(tablesOf(r.doc)), [
    [['Customer Information¶'], ['Full Name↵        YOKE HOW LOY¶', 'Gender↵        MALE¶'], ['Identification No↵        123124123¶', 'Expiry Date of ID↵        08 AUG 2024¶'], ['Address↵        -¶']],
    [['Case Information¶'], ['Nature of Services Provided¶BUYING OF PRECIOUS STONES.¶BUYING OF PRECIOUS METALS.¶↵Remarks¶-¶']],
    [['Declaration¶'], ['I declare that the information provided in this form is accurate and truthful. I understand that if I am found to have knowingly made false statements or intentionally omitted any significant details, I may face prosecution and legal penalties under applicable law.↵↵↵¶'], ['Signature:¶↵↵¶'],
      ['Yoke How Loy¶Name of Officer/ Shareholder/ Beneficial Owner/↵Purchaser/ Customer¶', '__________________________________________¶Date¶']],
    [['Risk Assessment Checklist¶'], ['Customer Risk Assessment¶'], [''], ['Is the customer a PEP?¶', '☐ YES   ☒ NO¶'], ['Is the country on the FATF list?¶', '☐ YES   ☒ NO¶'], ['Higher-risk profile?¶', '☐ YES   ☐ NO¶']],
  ]);
  const frames = (re) => Object.keys(r.files).filter((n) => re.test(n)).sort().map((n) => grid(tablesOf(r.files[n])));
  assert.deepEqual(frames(/word\/header\d+\.xml/), [[[['Customer Due Diligence Form¶', 'Case Reference: 123456¶']]], [[['Customer Due Diligence Form¶', 'Case Reference: 123456¶']]]]);
  assert.deepEqual(frames(/word\/footer\d+\.xml/), [[[['Acme Advisory Pte Ltd¶', 'Page {PAGE}/{SECTIONPAGES}¶']]], [[['Acme Advisory Pte Ltd¶', 'Page {PAGE}/{SECTIONPAGES}¶']]]]);
});
