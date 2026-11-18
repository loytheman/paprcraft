// PDF converter Lambda (pdfConvert.js) and the docx Lambda's hand-off to it, with fake AWS clients.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeHandler } = require('../pdfConvert.js');
const { makeHandler: makeDocx } = require('../docxTemplate.js');

process.env.TABLE = 'T';
process.env.BUCKET = 'B';

const KEY = { pk: '#TEMPLATE:t1', sk: '#TEMPLATE#METADATA' };
const makeDeps = (extra = {}) => {
  const item = { pk: KEY.pk, exportHistory: [{ cbId: 'cb1', processStatus: 'completed', path: 'accounts/a/templates/t1/exports/cb1.docx' }] };
  const puts = [];
  const invokes = [];
  return {
    item, puts, invokes,
    getItem: async () => item,
    updateItem: async (p) => {
      for (const [i, v] of Object.entries(p.ExpressionAttributeValues)) {
        if (!i.startsWith(':v')) continue;
        const n = Object.keys(p.ExpressionAttributeValues).filter((k) => k.startsWith(':v')).indexOf(i);
        item.exportHistory[0][p.ExpressionAttributeNames[`#f${n}`]] = v;
      }
    },
    getObject: async () => Buffer.from('docx-bytes'),
    putObject: async (p) => puts.push(p),
    convert: async () => Buffer.from('%PDF-fake'),
    invokeAsync: async (fn, payload) => invokes.push({ fn, payload }),
    ...extra,
  };
};
const event = { recordKey: KEY, cbId: 'cb1', docxPath: 'accounts/a/templates/t1/exports/cb1.docx' };

test('converts, stores the PDF beside the docx and marks the entry completed', async () => {
  const deps = makeDeps();
  const res = await makeHandler(deps)(event);
  assert.equal(res.ok, true);
  assert.equal(deps.puts[0].Key, 'accounts/a/templates/t1/exports/cb1.pdf');
  assert.equal(deps.puts[0].ContentType, 'application/pdf');
  assert.equal(deps.item.exportHistory[0].pdfStatus, 'completed');
  assert.equal(deps.item.exportHistory[0].pdfPath, 'accounts/a/templates/t1/exports/cb1.pdf');
});

test('a failed conversion marks pdfStatus failed with a safe message and does not throw', async () => {
  const deps = makeDeps({ convert: async () => { throw new Error('soffice exploded at /tmp/secret'); } });
  const res = await makeHandler(deps)(event);
  assert.equal(res.ok, false);
  assert.equal(deps.item.exportHistory[0].pdfStatus, 'failed');
  assert.ok(!deps.item.exportHistory[0].pdfError.includes('/tmp'));
  assert.equal(deps.item.exportHistory[0].processStatus, 'completed'); // the Word file is untouched
});

test('an empty PDF counts as a failure', async () => {
  const deps = makeDeps({ convert: async () => Buffer.alloc(0) });
  assert.equal((await makeHandler(deps)(event)).ok, false);
  assert.equal(deps.puts.length, 0);
});

test('a bad payload does nothing', async () => {
  const deps = makeDeps();
  assert.equal((await makeHandler(deps)({ cbId: 'cb1' })).ok, false);
  assert.equal(deps.puts.length, 0);
});

test('docx Lambda hands the finished file to the PDF Lambda only when asked', async () => {
  process.env.PDF_LAMBDA_NAME = 'pdf-fn';
  let template = { pk: KEY.pk, accountId: 'a', name: 'n', section: [], exportHistory: [{ cbId: 'cb1', processStatus: 'processing' }] };
  const run = async (pdf) => {
    const deps = makeDeps();
    deps.item = template = { ...template, exportHistory: [{ cbId: 'cb1', processStatus: 'processing' }] };
    deps.getItem = async () => template;
    deps.updateItem = async (p) => {
      const names = p.ExpressionAttributeNames; const vals = p.ExpressionAttributeValues;
      Object.keys(names).filter((k) => k.startsWith('#f')).forEach((k, n) => { template.exportHistory[0][names[k]] = vals[`:v${n}`]; });
    };
    await makeDocx(deps)({ templateId: 't1', cbId: 'cb1', values: {}, pdf });
    return { deps, template };
  };
  const on = await run(true);
  assert.equal(on.deps.invokes.length, 1);
  assert.equal(on.deps.invokes[0].fn, 'pdf-fn');
  assert.deepEqual(on.deps.invokes[0].payload.recordKey, KEY);
  assert.equal(on.template.exportHistory[0].pdfStatus, 'processing');
  const off = await run(false);
  assert.equal(off.deps.invokes.length, 0);
  assert.equal(off.template.exportHistory[0].pdfStatus, undefined);
});

test('forLibreOffice swaps the per-section page total for the whole-document one, in headers and footers only', async () => {
  const JSZip = require('jszip');
  const { forLibreOffice } = require('../pdfConvert.js');
  const zip = new JSZip();
  zip.file('word/footer1.xml', '<w:instrText>SECTIONPAGES</w:instrText>');
  zip.file('word/document.xml', '<w:t>SECTIONPAGES</w:t>');
  const out = await JSZip.loadAsync(await forLibreOffice(await zip.generateAsync({ type: 'nodebuffer' })));
  assert.equal(await out.file('word/footer1.xml').async('string'), '<w:instrText>NUMPAGES</w:instrText>');
  assert.equal(await out.file('word/document.xml').async('string'), '<w:t>SECTIONPAGES</w:t>');
});
