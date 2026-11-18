// Shared by the docx and PDF Lambdas: the item keys and the safe way to write one field of an
// exportHistory entry (found by cbId) on a Template or a Submission.
const keyOf = (templateId) => ({ pk: `#TEMPLATE:${templateId}`, sk: '#TEMPLATE#METADATA' });
const submissionKey = (id) => ({ pk: `#SUBMISSION:${id}`, sk: '#SUBMISSION#METADATA' });
const formKey = (id) => ({ pk: `#FORM:${id}`, sk: '#FORM#METADATA' });
const isConflict = (err) => err?.name === 'ConditionalCheckFailedException';

// Writes `fields` onto exportHistory[idx] where it is still the entry for cbId. The index is found
// by re-reading the item, so entries appended or removed meanwhile don't matter; one retry covers
// a concurrent change between the read and the write.
const patchExport = async (deps, table, key, cbId, fields) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const item = await deps.getItem(table, key);
    const idx = (item?.exportHistory ?? []).findIndex((h) => h.cbId === cbId);
    if (idx < 0) return false; // the export was deleted meanwhile
    const names = { '#h': 'exportHistory' };
    const vals = { ':cb': cbId };
    const sets = Object.entries(fields).map(([k, v], i) => {
      names[`#f${i}`] = k;
      vals[`:v${i}`] = v;
      return `#h[${idx}].#f${i} = :v${i}`;
    });
    try {
      await deps.updateItem({
        TableName: table,
        Key: key,
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression: `attribute_exists(pk) AND #h[${idx}].cbId = :cb`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: vals,
      });
      return true;
    } catch (err) {
      if (!isConflict(err)) throw err;
    }
  }
  return false;
};

module.exports = { keyOf, submissionKey, formKey, patchExport };
