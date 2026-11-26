<script setup>
// The template editor, for an account's own template (mode "account") or a staff master (mode
// "master"). Holds the template, the current section, the text-format toolbar, undo/redo, saving
// and the panels (placeholders, sections, export). The blocks themselves are in BlockList.vue.
//
// Data: template = { id, name, section: [{ name, list }], placeholders }. Undo/redo keeps JSON
// snapshots of the current section's list (taken 300 ms after the last change); restoring one
// remounts the editors (editKey), which reload their text from the stored html.
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, toRaw, watch } from 'vue';
import { RouterLink, onBeforeRouteLeave, useRouter } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import { askConfirm } from '@/helpers/Confirm';
import { canEdit } from '@/team';
import { ownApi, masterApi } from '@/services/service.template';
import { listSourceForms, getSourceForm } from '@/services/service.templateForm';
import * as ValueSetService from '@/services/service.valueSet';
import { TPL_KEY } from '@/helpers/template/context';
import { SIZES, refreshChips, setPlaceholderResolver } from '@/helpers/template/quill';
import {
  blankSection, cloneBlock, countPlaceholders, ensureIds, ensureTableCols, forEachBlock, indexAfterMove, insertAfterFocus,
  moveItem, newBlock, newContainer, normalizeKey, placeholderUsage, placeholdersForSave, renamePlaceholderKey, saveSignature, sectionsForSave, TABLE_TYPES,
  defaultCond, formGroups, formFields, formKeySet, insideRepeat, parseChip, repeatGroupAt,
  frameForSave, renameTokensIn,
} from '@/helpers/template/blocks';
import BlockList from './BlockList.vue';
import TplMenu from './TplMenu.vue';
import DialogSign from './DialogSign.vue';
import DialogTable from './DialogTable.vue';
import DialogLayout from './DialogLayout.vue';
import DialogFormTable from './DialogFormTable.vue';
import DialogChecklist from './DialogChecklist.vue';
import DialogDeclaration from './DialogDeclaration.vue';
import DialogPageSetup from './DialogPageSetup.vue';
import SectionManager from './SectionManager.vue';
import PlaceholderPanel from './PlaceholderPanel.vue';
import PlaceholderPicker from './PlaceholderPicker.vue';
import FieldPicker from './FieldPicker.vue';
import PlaceholderChipPopover from './PlaceholderChipPopover.vue';
import ExportPanel from './ExportPanel.vue';

const props = defineProps({
  id: { type: String, required: true },
  mode: { type: String, default: 'account' }, // account | master
});
const router = useRouter();
const isMaster = props.mode === 'master';
const api = isMaster ? masterApi : ownApi;

// ---- state --------------------------------------------------------------------------------
const template = ref(null);
const exportHistory = ref([]);
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const saveError = ref('');
const savedSig = ref('');
const liveSig = ref('');
const current = ref(0);
const editKey = ref(0);
const showPlaceholders = ref(true);
const showSections = ref(false);
const showExport = ref(false);
const showPicker = ref(false);
const pickerError = ref('');
const pickerText = ref('');
const showFields = ref(false);
const fieldError = ref('');
const forms = ref([]); // the data sources to choose from
const formSchema = ref(null); // the selected form's schema (null = none, or it could not be loaded)
const formError = ref('');
const rootEl = ref(null);
const dialogs = { sign: ref(null), table: ref(null), layout: ref(null), formTable: ref(null), checklist: ref(null), declaration: ref(null) };
const pageSetup = ref(null);

// Value sets: the placeholder values live in the account's sets (Settings > Value sets), not on the
// template. setDraft is an editable copy of the selected set's values, saved with the template.
const valueSets = ref(isMaster ? null : []); // null = masters have no sets
const setsError = ref('');
const setDraft = ref(null); // { KEY: value } of the selected set, or null when none is chosen (or it was deleted)
const setSavedJson = ref('null');
const setDirty = computed(() => JSON.stringify(setDraft.value) !== setSavedJson.value);

const readonly = computed(() => !isMaster && !canEdit.value);
const dirty = computed(() => !readonly.value && (savedSig.value !== liveSig.value || setDirty.value));
const section = computed(() => template.value?.section[current.value] ?? null);
const keys = computed(() => Object.keys(template.value?.placeholders ?? {}));
const formKeys = computed(() => formKeySet(formSchema.value));
// What the chips show: the set's values, then any value still saved on the template itself (older
// templates; the docx Lambda falls back to those the same way).
const effectiveValues = computed(() => {
  const out = { ...(template.value?.placeholders ?? {}) };
  for (const [k, v] of Object.entries(setDraft.value ?? {})) if (v) out[k] = v;
  return out;
});
const legacyCount = computed(() => Object.values(template.value?.placeholders ?? {}).filter((v) => String(v ?? '').trim()).length);
const counts = computed(() => (section.value ? countPlaceholders(section.value.list, effectiveValues.value, formKeys.value) : { total: 0, replaced: 0 }));
const groups = computed(() => formGroups(formSchema.value));
const hasFields = computed(() => formFields(formSchema.value).length > 0);
// The repeating group at the caret (inside a Repeat block, or a table that repeats a row).
const caretGroup = computed(() => (section.value && ctx.focusId ? repeatGroupAt(section.value.list, ctx.focusId) : ''));

// ---- editor context (read by every block) ------------------------------------------------
const editors = new Map(); // editorId -> { quill, blockId }
const selected = shallowRef(null); // { quill, range, blockId } of the editor that last had the caret
const rangeFormat = ref({});

const ctx = reactive({
  readonly,
  focusId: '',
  dragState: null,
  formSchema: null, // the template's data source (read by repeat / if blocks and the table dialog)
  groupAt: (id) => (section.value ? repeatGroupAt(section.value.list, id) : ''),
  setFocus: (id) => { ctx.focusId = id; },
  registerEditor: (editorId, blockId, quill) => { editors.set(editorId, { quill, blockId }); },
  unregisterEditor: (editorId, quill) => {
    if (editors.get(editorId)?.quill === quill) editors.delete(editorId);
    if (selected.value?.quill === quill) selected.value = null;
  },
  onSelection: (quill, range, blockId) => {
    selected.value = { quill, range, blockId };
    ctx.focusId = blockId;
    try {
      const f = { ...quill.getFormat(range.index, range.length) };
      if (!f.size) f.size = 'base';
      rangeFormat.value = f;
    } catch { /* the editor is going away */ }
  },
  openDialog: (kind, block) => dialogs[kind]?.value?.open(block),
});
provide(TPL_KEY, ctx);
watch(formSchema, (f) => { ctx.formSchema = f; }, { immediate: true });

const findEditor = (root) => {
  for (const { quill } of editors.values()) if (quill.root === root) return quill;
  return null;
};

// ---- placeholders: chips show the map's value live ---------------------------------------------
const lookupValue = (key) => {
  const map = effectiveValues.value;
  if (map[key]) return map[key];
  key = parseChip(key).base; // "dob|date" looks up "dob"
  if (map[key]) return map[key];
  const n = normalizeKey(key);
  for (const [k, v] of Object.entries(map)) if (v && normalizeKey(k) === n) return v;
  return '';
};
setPlaceholderResolver(lookupValue);
watch(effectiveValues, () => { for (const { quill } of editors.values()) refreshChips(quill); }, { flush: 'post' });

const addKey = (key) => { template.value.placeholders[key] = ''; };
const renameKey = (from, to) => {
  const map = template.value.placeholders;
  const value = map[from];
  renamePlaceholderKey(template.value.section, from, to);
  const fr = template.value.frame; // {{from}} in the page header / footer follows too
  if (fr) for (const k of ['headerLeft', 'headerRight', 'footerLeft']) fr[k] = renameTokensIn(fr[k] ?? '', from, to);
  delete map[from];
  map[to] = value ?? '';
  // The set's value follows the key (the old key stays in the set for other templates that use it).
  if (setDraft.value && setDraft.value[from] !== undefined && setDraft.value[to] === undefined) setDraft.value[to] = setDraft.value[from];
  editKey.value++; // editors reload their text, now with the new key
};

// ---- value sets ------------------------------------------------------------------------------
const setDraftFrom = (id) => {
  const s = id ? valueSets.value?.find((x) => x.id === id) : null;
  setDraft.value = s ? { ...(s.values ?? {}) } : null;
  setSavedJson.value = JSON.stringify(setDraft.value);
};
const loadSets = async () => {
  if (isMaster) return;
  setsError.value = '';
  try {
    valueSets.value = await ValueSetService.listValueSets();
  } catch (e) {
    setsError.value = e.message || 'Could not load your value sets.';
  }
  setDraftFrom(template.value?.valueSetId);
};
const selectSet = async (id) => {
  if (setDirty.value) {
    const ok = await askConfirm({ title: 'Discard value changes?', message: 'Your unsaved edits to the current value set are dropped.', confirmLabel: 'Discard and switch' });
    if (!ok) return;
  }
  template.value.valueSetId = id;
  setDraftFrom(id);
};
const createSet = async (name, values = {}) => {
  setsError.value = '';
  try {
    const s = await ValueSetService.createValueSet({ name, values });
    valueSets.value = [...valueSets.value, s].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    template.value.valueSetId = s.id;
    setDraftFrom(s.id);
    return true;
  } catch (e) {
    setsError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not create the value set.';
    return false;
  }
};
// Older templates kept their values on the template: put them in a new set and clear them here.
const moveLegacy = async () => {
  if (setDirty.value) {
    const ok = await askConfirm({ title: 'Discard value changes?', message: 'Your unsaved edits to the current value set are dropped.', confirmLabel: 'Discard and continue' });
    if (!ok) return;
  }
  const map = template.value.placeholders;
  const values = Object.fromEntries(Object.entries(map).filter(([, v]) => String(v ?? '').trim()));
  const taken = new Set((valueSets.value ?? []).map((s) => s.name.toLowerCase()));
  let name = template.value.name.trim() || 'Template values';
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${template.value.name.trim() || 'Template values'} (${i})`;
  const ok = await createSet(name, values);
  if (!ok) return;
  for (const k of Object.keys(map)) map[k] = '';
};
const removeKey = async (key) => {
  const used = placeholderUsage(template.value.section, template.value.frame)[key] ?? 0;
  if (used) {
    const ok = await askConfirm({ title: `Remove ${key}?`, message: 'Chips with this key stay in the text and show {{KEY}} until you give them another key.', confirmLabel: 'Remove' });
    if (!ok) return;
  }
  delete template.value.placeholders[key];
};

// ---- text formatting ---------------------------------------------------------------------------
const applyFormat = (name, value) => {
  const s = selected.value;
  if (!s || readonly.value) return;
  const { quill, range } = s;
  quill.focus();
  quill.setSelection(range.index, range.length, 'silent');
  if (range.length) quill.formatText(range.index, range.length, name, value, 'user');
  else quill.format(name, value, 'user');
  ctx.onSelection(quill, quill.getSelection() ?? range, s.blockId);
};
const toggleFormat = (name) => applyFormat(name, !rangeFormat.value[name]);
const sizeItems = computed(() => SIZES.map((s) => ({ label: s.label, action: () => applyFormat('size', s.value) })));
const sizeLabel = computed(() => SIZES.find((s) => s.value === rangeFormat.value.size)?.label ?? 'normal');

const toggleFields = () => {
  fieldError.value = '';
  showPicker.value = false;
  showFields.value = !showFields.value;
};
// A chip for a field of the form: the key (and formatter) as it is, no entry in the placeholder map.
const insertField = (text) => {
  const s = selected.value;
  if (!s) { fieldError.value = 'Click in the text where the field should go first.'; return; }
  fieldError.value = '';
  const { quill, range } = s;
  quill.focus();
  if (range.length) quill.deleteText(range.index, range.length, 'user');
  quill.insertEmbed(range.index, 'placeholder', { text, value: '' }, 'user');
  quill.setSelection(range.index + 1, 0, 'silent');
  selected.value = { ...s, range: { index: range.index + 1, length: 0 } };
};

const togglePicker = () => {
  showFields.value = false;
  pickerError.value = '';
  pickerText.value = '';
  const s = selected.value;
  if (s?.range.length) pickerText.value = s.quill.getText(s.range.index, s.range.length);
  showPicker.value = !showPicker.value;
};
const insertPlaceholder = (raw) => {
  const key = normalizeKey(raw);
  const s = selected.value;
  if (!key) return;
  if (!s) { pickerError.value = 'Click in the text where the placeholder should go first.'; return; }
  pickerError.value = '';
  if (!(key in template.value.placeholders)) template.value.placeholders[key] = '';
  const { quill, range } = s;
  quill.focus();
  if (range.length) quill.deleteText(range.index, range.length, 'user');
  quill.insertEmbed(range.index, 'placeholder', { text: key, value: '' }, 'user');
  quill.setSelection(range.index + 1, 0, 'silent');
  selected.value = { ...s, range: { index: range.index + 1, length: 0 } };
  showPicker.value = false;
};

// ---- blocks ---------------------------------------------------------------------------------
const addBlock = (type) => {
  if (!section.value || readonly.value) return;
  const block = newBlock(type);
  insertAfterFocus(section.value.list, ctx.focusId, block);
  ctx.focusId = block.id;
};
const addContainer = (type) => {
  if (!section.value || readonly.value) return;
  const g = groups.value[0]?.key ?? '';
  const block = newContainer(type, { group: g, cond: defaultCond(formSchema.value) });
  insertAfterFocus(section.value.list, ctx.focusId, block);
  ctx.focusId = block.id;
};
const containerItems = () => {
  const noForm = !formSchema.value;
  const inRepeat = !!section.value && !!ctx.focusId && insideRepeat(section.value.list, ctx.focusId);
  return [
    noForm || !groups.value.length || inRepeat
      ? { label: noForm ? 'Repeat for each row (choose a data source first)' : inRepeat ? 'Repeat for each row (not inside another repeat)' : 'Repeat for each row (the form has no repeating group)', disabled: true }
      : { label: 'Repeat for each row of a group', icon: 'refresh', action: () => addContainer('repeat') },
    !hasFields.value
      ? { label: 'Only if... (choose a data source first)', disabled: true }
      : { label: 'Only if a condition holds', icon: 'layout', action: () => addContainer('if') },
  ];
};

const addItems = computed(() => [
  { label: 'Paragraph', action: () => addBlock('paragraph') },
  { label: 'Numbered list', action: () => addBlock('list') },
  { label: 'List item', action: () => addBlock('list-item-paragraph') },
  { label: 'Table', action: () => addBlock('table-01') },
  { label: 'Layout', heading: true },
  { label: 'Page break', action: () => addBlock('page-break') },
  { label: 'Page break with page numbers', action: () => addBlock('page-break-02') },
  { label: 'Letterhead', action: () => addBlock('layout-corpsec-header-01') },
  { label: 'Company header', action: () => addBlock('layout-company-header-01') },
  { label: 'Act heading', action: () => addBlock('layout-company-act') },
  { label: 'Form 45B heading', action: () => addBlock('layout-form-45b') },
  { label: 'Signature area', action: () => addBlock('sign-area-01') },
  { label: 'Form data', heading: true },
  ...containerItems(),
  { label: 'Section table', icon: 'layout', action: () => addBlock('form-table') },
  { label: 'Checklist table', icon: 'check', action: () => addBlock('form-checklist') },
  { label: 'Declaration', icon: 'pencil', action: () => addBlock('form-declaration') },
]);

// ---- sections ------------------------------------------------------------------------------
const selectSection = (i) => {
  flush();
  current.value = i;
  selected.value = null;
  ctx.focusId = '';
  editKey.value++;
  showSections.value = false;
};
const addSection = () => {
  const t = template.value;
  t.section.push(blankSection(`section ${t.section.length + 1}`));
  selectSection(t.section.length - 1);
};
const cloneSection = (i) => {
  const t = template.value;
  const src = t.section[i];
  t.section.splice(i + 1, 0, { name: `${src.name} copy`, list: src.list.map(cloneBlock) });
  selectSection(i + 1);
};
const deleteSection = async (i) => {
  const ok = await askConfirm({ title: 'Delete this section?', message: 'Its text is removed. You can still undo by reloading before you save.', confirmLabel: 'Delete section' });
  if (!ok) return;
  const t = template.value;
  t.section.splice(i, 1);
  if (i < current.value) current.value--;
  current.value = Math.min(current.value, t.section.length - 1);
  selected.value = null;
  editKey.value++;
};
const moveSection = (from, to) => {
  const t = template.value;
  t.section.splice(0, t.section.length, ...moveItem([...t.section], from, to));
  current.value = indexAfterMove(current.value, from, to);
};

// ---- undo / redo -----------------------------------------------------------------------------
const histories = new WeakMap(); // section object -> { undo: [json], redo: [json] }
const historyTick = ref(0);
const historyOf = (s) => {
  let h = histories.get(toRaw(s));
  if (!h) { h = { undo: [JSON.stringify(s.list)], redo: [] }; histories.set(toRaw(s), h); }
  return h;
};
const snapshotNow = () => {
  const t = template.value;
  if (!t) return;
  liveSig.value = saveSignature(t);
  const s = t.section[current.value];
  if (!s) return;
  const h = historyOf(s);
  const cur = JSON.stringify(s.list);
  if (cur !== h.undo.at(-1)) {
    h.undo.push(cur);
    if (h.undo.length > 100) h.undo.shift();
    h.redo.length = 0;
    historyTick.value++;
  }
};
let timer = null;
const flush = () => { clearTimeout(timer); timer = null; snapshotNow(); };
watch(template, () => { clearTimeout(timer); timer = setTimeout(snapshotNow, 300); }, { deep: true });

const canUndo = computed(() => { historyTick.value; return !!section.value && historyOf(section.value).undo.length > 1; });
const canRedo = computed(() => { historyTick.value; return !!section.value && historyOf(section.value).redo.length > 0; });
const applyList = (s, json) => {
  s.list.splice(0, s.list.length, ...JSON.parse(json));
  selected.value = null;
  editKey.value++;
  historyTick.value++;
};
const undo = () => {
  if (readonly.value || !section.value) return;
  flush();
  const h = historyOf(section.value);
  if (h.undo.length < 2) return;
  h.redo.push(h.undo.pop());
  applyList(section.value, h.undo.at(-1));
};
const redo = () => {
  if (readonly.value || !section.value) return;
  flush();
  const h = historyOf(section.value);
  if (!h.redo.length) return;
  const next = h.redo.pop();
  h.undo.push(next);
  applyList(section.value, next);
};
const onKeydown = (e) => {
  if (!(e.metaKey || e.ctrlKey) || !rootEl.value?.contains(document.activeElement)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
};

// ---- load / save -----------------------------------------------------------------------------
const normalize = (t) => {
  if (!Array.isArray(t.section) || !t.section.length) t.section = [blankSection()];
  t.placeholders = t.placeholders ?? {};
  t.valueSetId = t.valueSetId ?? '';
  t.style = t.style ?? ''; // '' = letter (older templates)
  t.frame = t.frame ?? null;
  for (const s of t.section) {
    s.list = ensureIds(s.list ?? []);
    forEachBlock(s.list, (b) => { if (TABLE_TYPES.includes(b.type)) ensureTableCols(b.item?.data ?? [], b.type); });
  }
  return t;
};

// The data source: the forms to choose from, and the schema of the selected one.
const loadForms = async () => {
  try { forms.value = await listSourceForms(isMaster); } catch { forms.value = []; }
};
const loadSchema = async (id) => {
  formError.value = '';
  formSchema.value = null;
  if (!id) return;
  try {
    formSchema.value = (await getSourceForm(isMaster, id))?.schema ?? null;
  } catch (e) {
    formError.value = e.httpStatus === 404 ? 'The selected form no longer exists. Choose another data source or none.' : 'Could not load the form.';
  }
};
const onSource = async (id) => {
  template.value.formId = id;
  await loadSchema(id);
};

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const { exportHistory: history, ...t } = await api.get(props.id);
    t.formId = t.formId ?? '';
    template.value = normalize(t);
    exportHistory.value = history ?? [];
    savedSig.value = liveSig.value = saveSignature(t);
    current.value = 0;
    selected.value = null;
    ctx.focusId = '';
    editKey.value++;
    loadForms();
    await Promise.all([loadSchema(template.value.formId), loadSets()]);
  } catch (e) {
    loadError.value = e.httpStatus === 404 ? 'This template does not exist.' : e.message || 'Could not load the template.';
  }
  loading.value = false;
};

const save = async () => {
  const t = template.value;
  if (!t.name.trim()) { saveError.value = 'Give the template a name.'; return false; }
  flush();
  saving.value = true;
  saveError.value = '';
  const sig = saveSignature(t);
  try {
    // The set first: the template's export reads it.
    if (setDirty.value && setDraft.value && t.valueSetId) {
      const setJson = JSON.stringify(setDraft.value);
      const s = await ValueSetService.updateValueSet(t.valueSetId, { values: placeholdersForSave(setDraft.value) });
      valueSets.value = valueSets.value.map((x) => (x.id === s.id ? s : x));
      setSavedJson.value = setJson;
    }
    const body = { name: t.name.trim(), section: sectionsForSave(t.section), placeholders: placeholdersForSave(t.placeholders), formId: t.formId || null, ...(t.style && { style: t.style }), frame: frameForSave(t.frame), ...(!isMaster && { valueSetId: t.valueSetId || null }) };
    const res = await api.update(props.id, body);
    if (res?.exportHistory) exportHistory.value = res.exportHistory;
    savedSig.value = sig;
    saving.value = false;
    return true;
  } catch (e) {
    saveError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not save the template.';
    saving.value = false;
    return false;
  }
};
const saveOrThrow = async () => { if (!(await save())) throw new Error(saveError.value || 'Could not save the template.'); };

const reload = async () => {
  if (dirty.value) {
    const ok = await askConfirm({ title: 'Discard your changes?', message: 'The template goes back to the last saved version.', confirmLabel: 'Discard changes' });
    if (!ok) return;
  }
  await load();
};

const beforeUnload = (e) => { if (dirty.value) { e.preventDefault(); e.returnValue = ''; } };
onMounted(() => {
  load();
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', beforeUnload);
  setPlaceholderResolver(null);
});
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  return askConfirm({ title: 'Leave without saving?', message: 'You have unsaved changes to this template.', confirmLabel: 'Leave', icon: 'x' });
});
</script>

<template>
  <PageSkeleton v-if="loading" kind="form" />
  <p v-else-if="loadError" role="alert" class="status-down rounded-control border px-3 py-2 text-small">
    {{ loadError }} <RouterLink :to="{ name: isMaster ? 'staff-templates' : 'templates' }" class="underline">Back to templates</RouterLink>
  </p>

  <div v-else-if="template" ref="rootEl">
    <p v-if="isMaster" class="mb-4 rounded-control border border-tertiary/40 bg-tertiary/10 px-3 py-2 text-small text-ink-muted">
      <strong class="font-medium text-ink">Master template.</strong> Every account can copy it into its own templates. Changes here don't affect copies already made.
    </p>
    <p v-else-if="readonly" class="mb-4 rounded-control border border-line px-3 py-2 text-small text-ink-muted">You can view this template. Only members and owners can edit it.</p>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <RouterLink :to="{ name: isMaster ? 'staff-templates' : 'templates' }" class="text-ink-faint hover:text-ink" aria-label="Back to templates"><OpIcon name="arrow-left" :size="18" /></RouterLink>
        <input v-model="template.name" :readonly="readonly" aria-label="Template name" class="min-w-0 flex-1 rounded-control border border-transparent bg-transparent px-2 py-1 text-h3 text-ink hover:border-line focus:border-primary focus:outline-none" />
      </div>
      <div class="flex items-center gap-2">
        <span v-if="dirty" class="text-small text-warn">Unsaved changes</span>
        <OpButton variant="secondary" size="sm" aria-label="Reload" @click="reload"><OpIcon name="refresh" :size="14" /></OpButton>
        <OpButton v-if="!readonly" variant="secondary" size="sm" icon="layout" @click="pageSetup.open(template)">Page setup</OpButton>
        <OpButton v-if="!isMaster" variant="secondary" size="sm" icon="send" @click="showExport = !showExport">Generate</OpButton>
        <OpButton v-if="!readonly" size="sm" icon="check" :disabled="saving || !dirty" @click="save">{{ saving ? 'Saving…' : 'Save' }}</OpButton>
      </div>
    </div>
    <p v-if="saveError" role="alert" class="status-down mt-3 rounded-control border px-3 py-2 text-small">{{ saveError }}</p>

    <!-- Data source: the form whose fields this template can use -->
    <div class="mt-3 flex flex-wrap items-center gap-2 text-small text-ink-muted">
      <label for="tpl-source" class="font-medium">Data source</label>
      <select id="tpl-source" :value="template.formId" :disabled="readonly" class="h-9 max-w-64 rounded-control border border-line bg-surface-1 px-2 text-body text-ink focus:border-primary focus:outline-none disabled:opacity-60" @change="onSource($event.target.value)">
        <option value="">None: type placeholders by hand</option>
        <option v-if="template.formId && !forms.some((f) => f.id === template.formId)" :value="template.formId">Selected form (not in your list)</option>
        <option v-for="f in forms" :key="f.id" :value="f.id">{{ f.name }}</option>
      </select>
      <span v-if="formSchema" class="text-ink-faint">Use <strong class="font-medium text-ink-muted">Insert field</strong> to put its answers in the text.</span>
      <span v-else-if="!formError" class="text-ink-faint">Pick a form to insert its fields; a submission of it fills this template.</span>
      <span v-if="formError" role="alert" class="text-down">{{ formError }}</span>
    </div>

    <!-- Section bar -->
    <div class="mt-4 flex flex-wrap items-center gap-1">
      <OpButton variant="ghost" size="sm" :disabled="current === 0" aria-label="Previous section" @click="selectSection(current - 1)"><OpIcon name="arrow-left" :size="14" /></OpButton>
      <OpButton variant="ghost" size="sm" :disabled="current >= template.section.length - 1" aria-label="Next section" @click="selectSection(current + 1)"><OpIcon name="arrow-right" :size="14" /></OpButton>
      <button type="button" class="inline-flex items-center gap-2 rounded-control px-2 py-1 text-body text-ink hover:bg-ink/4" @click="showSections = true">
        <OpIcon name="layout" :size="15" class="text-ink-faint" />
        <span class="capitalize">{{ current + 1 }}. {{ section.name }}</span>
        <span class="text-small text-ink-faint">of {{ template.section.length }}</span>
      </button>
    </div>

    <!-- Toolbar -->
    <div class="sticky top-[3.6rem] z-30 mt-2">
      <div v-if="!readonly" class="flex flex-wrap items-center gap-0.5 rounded-card border border-line bg-surface-2/95 px-2 py-1 backdrop-blur-md">
        <TplMenu :label="sizeLabel" :items="sizeItems" title="Text size" button-class="capitalize w-28 justify-between" />
        <button type="button" title="Bold" :class="['size-8 rounded-control text-body font-bold hover:bg-ink/4', rangeFormat.bold ? 'bg-ink/8 text-ink' : 'text-ink-muted']" @mousedown.prevent @click="toggleFormat('bold')">B</button>
        <button type="button" title="Italic" :class="['size-8 rounded-control text-body italic hover:bg-ink/4', rangeFormat.italic ? 'bg-ink/8 text-ink' : 'text-ink-muted']" @mousedown.prevent @click="toggleFormat('italic')">I</button>
        <button type="button" title="Underline" :class="['size-8 rounded-control text-body underline hover:bg-ink/4', rangeFormat.underline ? 'bg-ink/8 text-ink' : 'text-ink-muted']" @mousedown.prevent @click="toggleFormat('underline')">U</button>
        <button type="button" title="Strikethrough" :class="['size-8 rounded-control text-body line-through hover:bg-ink/4', rangeFormat.strike ? 'bg-ink/8 text-ink' : 'text-ink-muted']" @mousedown.prevent @click="toggleFormat('strike')">S</button>
        <button type="button" title="Insert a field of the form, or a document value" :class="['h-8 rounded-control px-2 text-small hover:bg-ink/4', showFields ? 'bg-warn/15 text-ink' : 'text-ink-muted']" @mousedown.prevent @click="toggleFields">Insert field</button>
        <button type="button" title="Insert a placeholder" :class="['h-8 rounded-control px-2 font-mono text-small hover:bg-ink/4', showPicker ? 'bg-warn/15 text-ink' : 'text-ink-muted']" @mousedown.prevent @click="togglePicker"><span v-pre>{{x}}</span></button>
        <span class="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <button type="button" title="Undo (Ctrl/Cmd+Z)" aria-label="Undo" class="size-8 rounded-control text-ink-muted hover:bg-ink/4 disabled:opacity-30" :disabled="!canUndo" @mousedown.prevent @click="undo"><OpIcon name="arrow-left" :size="15" class="mx-auto" /></button>
        <button type="button" title="Redo (Ctrl/Cmd+Y)" aria-label="Redo" class="size-8 rounded-control text-ink-muted hover:bg-ink/4 disabled:opacity-30" :disabled="!canRedo" @mousedown.prevent @click="redo"><OpIcon name="arrow-right" :size="15" class="mx-auto" /></button>
        <span class="mx-2 hidden text-small text-ink-faint sm:inline">{{ counts.replaced }}/{{ counts.total }} placeholders</span>
        <span class="ml-auto" />
        <TplMenu label="Add item" icon="plus" :items="addItems" align="right" />
        <button type="button" :class="['h-8 rounded-control px-2 text-small hover:bg-ink/4', showPlaceholders ? 'text-ink' : 'text-ink-muted']" @click="showPlaceholders = !showPlaceholders">Placeholders</button>
      </div>
      <div v-if="showFields && !readonly" class="mt-2 max-w-xl">
        <FieldPicker :open="showFields" :schema="formSchema" :repeat-group="caretGroup" :error="fieldError" @insert="insertField" @close="showFields = false" />
      </div>
      <div v-if="showPicker && !readonly" class="mt-2 max-w-xl">
        <PlaceholderPicker :open="showPicker" :keys="keys" :selected-text="pickerText" :error="pickerError" @insert="insertPlaceholder" @close="showPicker = false" />
      </div>
    </div>

    <div class="mt-3 grid items-start gap-4" :class="showPlaceholders ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''">
      <div class="min-h-80 rounded-card border border-line bg-surface-1 p-3 sm:p-4">
        <BlockList :key="`${current}:${editKey}`" :model-value="section.list" />
        <p v-if="!section.list.length" class="py-8 text-center text-body text-ink-muted">This section is empty. Use <strong class="font-medium text-ink">Add item</strong> to add a paragraph, list, table or layout block.</p>
      </div>
      <PlaceholderPanel
        v-if="showPlaceholders"
        :placeholders="template.placeholders"
        :values="setDraft"
        :sets="valueSets"
        :set-id="template.valueSetId"
        :sets-error="setsError"
        :legacy-count="legacyCount"
        :sections="template.section"
        :frame="template.frame"
        :form-keys="formKeys"
        :readonly="readonly"
        @add="addKey"
        @rename="renameKey"
        @remove="removeKey"
        @select-set="selectSet"
        @new-set="(name) => createSet(name)"
        @move-legacy="moveLegacy"
      />
    </div>

    <DialogSign :ref="dialogs.sign" />
    <DialogTable :ref="dialogs.table" />
    <DialogLayout :ref="dialogs.layout" />
    <DialogFormTable :ref="dialogs.formTable" />
    <DialogChecklist :ref="dialogs.checklist" />
    <DialogDeclaration :ref="dialogs.declaration" />
    <DialogPageSetup ref="pageSetup" />
    <SectionManager
      :open="showSections"
      :sections="template.section"
      :current="current"
      :placeholders="effectiveValues"
      :readonly="readonly"
      @close="showSections = false"
      @select="selectSection"
      @add="addSection"
      @clone="cloneSection"
      @delete="deleteSection"
      @move="moveSection"
    />
    <PlaceholderChipPopover :placeholders="template.placeholders" :values="setDraft" :readonly="readonly" :find-editor="findEditor" />
    <ExportPanel
      v-if="!isMaster"
      :open="showExport"
      :template-id="id"
      :template-name="template.name"
      :history="exportHistory"
      :dirty="dirty"
      :readonly="readonly"
      :save="saveOrThrow"
      :value-set-id="template.valueSetId"
      :value-set-name="valueSets?.find((s) => s.id === template.valueSetId)?.name ?? ''"
      @close="showExport = false"
      @history="(h) => (exportHistory = h)"
    />
  </div>
</template>
