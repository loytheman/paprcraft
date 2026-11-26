<script setup>
// Data sources: the account's named sets of placeholder values (value sets in the API,
// service.valueSet.js), e.g. one per client company. A template picks a data source and its
// {{KEY}} chips are filled from it, so the same template gives a different document per data
// source. Create (empty, or by duplicating an existing one), rename, edit the values, delete.
import { computed, nextTick, onMounted, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import RowMenu from '@/components/RowMenu.vue';
import { ROW_CLICKABLE, onRow } from '@/helpers/rowClick';
import OpIcon from '@ds/components/OpIcon.vue';
import OpInput from '@ds/components/OpInput.vue';
import OpSelect from '@ds/components/OpSelect.vue';
import TplDialog from '@/components/template/TplDialog.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import * as ValueSetService from '@/services/service.valueSet';
import { BUILTIN_VALUES, isReservedKey, normalizeKey } from '@/helpers/template/blocks';
import { askConfirm } from '@/helpers/Confirm';
import { canEdit } from '@/team';

const sets = ref([]);
const loaded = ref(false);
const loadError = ref('');
const search = ref('');
const shown = computed(() => {
  const q = search.value.trim().toLowerCase();
  return q ? sets.value.filter((s) => s.name.toLowerCase().includes(q)) : sets.value;
});

const load = async () => {
  try {
    sets.value = await ValueSetService.listValueSets();
    loadError.value = '';
  } catch (e) {
    loadError.value = e.message || 'Could not load your data sources.';
  }
  loaded.value = true;
};
onMounted(load);

// A name no other data source uses ("Acme (copy)", "Acme (copy 2)", ...); names are unique per account.
const freeName = (base) => {
  const taken = new Set(sets.value.map((s) => s.name.toLowerCase()));
  let name = `${base} (copy)`;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} (copy ${i})`;
  return name;
};

// New data source, in a dialog: empty, or a copy of an existing one (same keys and values, to change
// what differs). Once made, it opens in the edit dialog.
const showNew = ref(false);
const draftName = ref('');
const copyFrom = ref('');
const createError = ref('');
const creating = ref(false);
// Picking a copy suggests "<name> (copy)" while the name is still empty or still the last suggestion.
let suggested = '';
const copyOptions = computed(() => [{ value: '', label: 'Empty' }, ...sets.value.map((s) => ({ value: s.id, label: `A copy of ${s.name}` }))]);
const newForm = ref(null);
const openNew = async () => {
  draftName.value = '';
  copyFrom.value = '';
  suggested = '';
  createError.value = '';
  showNew.value = true;
  await nextTick(); // the dialog opens after this render; then the name field takes the focus
  requestAnimationFrame(() => newForm.value?.querySelector('input')?.focus());
};
const create = async () => {
  if (!draftName.value.trim() || creating.value) return;
  creating.value = true;
  createError.value = '';
  try {
    const src = sets.value.find((s) => s.id === copyFrom.value);
    const created = await ValueSetService.createValueSet({ name: draftName.value.trim(), values: { ...(src?.values ?? {}) } });
    showNew.value = false;
    await load();
    startEdit(created);
  } catch (e) {
    createError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not create the data source.';
  }
  creating.value = false;
};
const onCopyFrom = (id) => {
  copyFrom.value = id;
  const src = sets.value.find((s) => s.id === id);
  const name = draftName.value.trim();
  if (!name || name === suggested) {
    suggested = src ? freeName(src.name) : '';
    draftName.value = suggested;
  }
};

// Duplicate from a row: after a confirmation, the copy is made and opened for editing.
const duplicating = ref('');
const duplicate = async (s) => {
  const name = freeName(s.name);
  const ok = await askConfirm({ title: `Duplicate "${s.name}"?`, message: `A copy called "${name}" is created with the same values, and opened for editing. The original stays as it is.`, confirmLabel: 'Duplicate', icon: 'copy', tone: 'primary' });
  if (!ok) return;
  duplicating.value = s.id;
  loadError.value = '';
  try {
    const created = await ValueSetService.createValueSet({ name, values: { ...(s.values ?? {}) } });
    await load();
    startEdit(created);
  } catch (e) {
    loadError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not duplicate the data source.';
  }
  duplicating.value = '';
};

// Edit one data source in a dialog: its name and rows of KEY / value. Closing with unsaved changes asks first.
const editing = ref(null); // the id being edited (the dialog is open while set)
const edit = ref({ name: '', rows: [] });
const editSaved = ref('');
const editDirty = computed(() => !!editing.value && JSON.stringify(edit.value) !== editSaved.value);
const editTitle = computed(() => (canEdit.value ? 'Edit data source' : 'Data source'));
const newKey = ref('');
const rowError = ref('');
const saving = ref(false);
const editForm = ref(null);
const startEdit = async (s) => {
  editing.value = s.id;
  edit.value = { name: s.name, rows: Object.entries(s.values ?? {}).map(([key, value]) => ({ key, value })) };
  editSaved.value = JSON.stringify(edit.value);
  newKey.value = '';
  rowError.value = '';
  if (!canEdit.value) return;
  await nextTick(); // focus the first value (or the new-key field when there are none) once the dialog is open
  requestAnimationFrame(() => editForm.value?.querySelector('input[aria-label^="Value for"], input[aria-label="New key"]')?.focus());
};
const closeEdit = async () => {
  if (saving.value) return;
  if (canEdit.value && editDirty.value) {
    const ok = await askConfirm({ title: 'Discard your changes?', message: 'Your edits to this data source are not saved.', confirmLabel: 'Discard changes', icon: 'x' });
    if (!ok) return;
  }
  editing.value = null;
};
const addRow = () => {
  const key = normalizeKey(newKey.value);
  if (!key) { rowError.value = 'Use letters and numbers, e.g. COMPANY_NAME.'; return; }
  if (isReservedKey(key)) { rowError.value = `${key} is reserved: the document fills it in itself.`; return; }
  if (edit.value.rows.some((r) => r.key === key)) { rowError.value = `${key} is already in this data source.`; return; }
  rowError.value = '';
  edit.value.rows.push({ key, value: '' });
  newKey.value = '';
};
const removeRow = (i) => { edit.value.rows.splice(i, 1); };
const save = async () => {
  if (!canEdit.value || saving.value || !edit.value.name.trim()) return;
  saving.value = true;
  rowError.value = '';
  try {
    const values = Object.fromEntries(edit.value.rows.map((r) => [r.key, String(r.value ?? '')]));
    await ValueSetService.updateValueSet(editing.value, { name: edit.value.name.trim(), values });
    editing.value = null;
    await load();
  } catch (e) {
    rowError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not save the data source.';
  }
  saving.value = false;
};
const remove = async (s) => {
  const ok = await askConfirm({
    title: `Delete the data source "${s.name}"?`,
    message: 'Templates that use it must pick another data source before their next export.',
    confirmLabel: 'Delete data source',
  });
  if (!ok) return;
  try {
    await ValueSetService.deleteValueSet(s.id);
    if (editing.value === s.id) editing.value = null;
    await load();
  } catch (e) {
    loadError.value = e.message || 'Could not delete the data source.';
  }
};
const chip = (k) => `{{${k}}}`;
const count = (s) => Object.keys(s.values ?? {}).length;
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <h1 class="text-h2 text-ink">Data sources</h1>
      <OpButton v-if="canEdit && loaded" icon="plus" @click="openNew">New data source</OpButton>
    </div>
    <p class="mt-2 text-body text-ink-muted">
      Each data source holds the values for your templates' <span v-pre class="font-mono">{{KEY}}</span> placeholders, for example one per client.
      Pick one in a template's Placeholders panel, or when you generate a document.
    </p>

    <p v-if="loadError" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ loadError }}</p>

    <PageSkeleton v-if="!loaded" kind="form" class="mt-8" />

    <template v-else>
      <input v-if="sets.length > 5" v-model="search" type="search" placeholder="Search data sources" aria-label="Search data sources" class="mt-6 h-10 w-full rounded-control border border-line bg-surface-1 px-3 text-body text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none" />

      <section class="mt-6 rounded-sheet border border-line bg-surface-2">
        <p v-if="!sets.length" class="px-6 py-8 text-center text-body text-ink-muted">No data sources yet.<template v-if="canEdit"> <button type="button" class="underline" @click="openNew">Add the first one</button>.</template></p>
        <p v-else-if="!shown.length" class="px-6 py-8 text-center text-body text-ink-muted">No data source matches "{{ search.trim() }}".</p>
        <ul v-else>
          <li v-for="s in shown" :key="s.id" :class="['border-b border-line-faint px-5 py-3 last:border-b-0', ROW_CLICKABLE]" @click="onRow($event, () => startEdit(s))">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-body text-ink">{{ s.name }}</p>
                <p class="text-small text-ink-faint">{{ count(s) }} {{ count(s) === 1 ? 'value' : 'values' }}</p>
              </div>
              <div class="flex items-center gap-1">
                <span v-if="duplicating === s.id" class="mr-1 text-small text-ink-faint">Duplicating…</span>
                <OpButton size="sm" variant="secondary" @click="startEdit(s)">{{ canEdit ? 'Edit' : 'View' }}</OpButton>
                <RowMenu v-if="canEdit" :label="`More actions for ${s.name}`" :items="[{ label: 'Duplicate', icon: 'copy', disabled: !!duplicating, action: () => duplicate(s) }, { label: 'Delete', icon: 'trash', danger: true, action: () => remove(s) }]" />
              </div>
            </div>
          </li>
        </ul>
      </section>

      <!-- Reserved placeholders: filled in by the document itself, so no data source can define them -->
      <section class="mt-8 rounded-sheet border border-line bg-surface-2 p-6" aria-labelledby="ds-reserved">
        <h2 id="ds-reserved" class="text-h3 text-ink">Reserved placeholders</h2>
        <p class="mt-1 text-body text-ink-muted">These are filled in automatically when a document is generated, so you can use them in any template without a data source. A data source can't use these keys.</p>
        <ul class="mt-4 divide-y divide-line-faint">
          <li v-for="b in BUILTIN_VALUES" :key="b.key" class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:gap-4">
            <span class="font-mono text-small text-ink sm:w-48 sm:shrink-0">{{ chip(b.key) }}</span>
            <div class="min-w-0 flex-1">
              <p class="text-body text-ink">{{ b.label }}</p>
              <p class="text-small text-ink-muted">{{ b.help }}<template v-if="b.submission"> Only filled when you generate from a submission.</template></p>
              <p class="text-small text-ink-faint">e.g. {{ b.example }}</p>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <TplDialog :open="!!editing" :title="editTitle" wide @close="closeEdit">
      <div ref="editForm" class="space-y-4">
        <OpInput v-model="edit.name" class="max-w-sm" label="Name" :readonly="!canEdit" />
        <div>
          <p class="text-small font-medium text-ink-muted">Values</p>
          <p v-if="!edit.rows.length" class="mt-1 text-small text-ink-faint">{{ canEdit ? 'No values yet. Add a key below.' : 'No values yet.' }}</p>
          <ul class="mt-2 space-y-2">
            <li v-for="(r, i) in edit.rows" :key="r.key" class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span class="truncate font-mono text-small text-ink sm:w-52 sm:shrink-0" :title="chip(r.key)">{{ chip(r.key) }}</span>
              <div class="flex min-w-0 flex-1 items-center gap-2">
                <input v-model="r.value" :readonly="!canEdit" :aria-label="`Value for ${r.key}`" placeholder="Value" class="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface-2 px-3 text-body text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none" @keydown.enter.prevent="save" />
                <button v-if="canEdit" type="button" class="p-1 text-ink-faint hover:text-down" :aria-label="`Remove ${r.key}`" @click="removeRow(i)"><OpIcon name="trash" :size="14" /></button>
              </div>
            </li>
          </ul>
        </div>
        <form v-if="canEdit" class="flex max-w-sm gap-2" @submit.prevent="addRow">
          <input v-model="newKey" placeholder="NEW_KEY" aria-label="New key" class="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface-2 px-3 font-mono text-small text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none" />
          <OpButton type="submit" size="sm" variant="secondary" icon="plus" :disabled="!newKey.trim()">Add key</OpButton>
        </form>
        <p v-if="rowError" role="alert" class="status-down rounded-control border px-3 py-2 text-small">{{ rowError }}</p>
      </div>
      <template #footer>
        <span v-if="canEdit && editDirty" class="mr-auto self-center text-small text-warn">Unsaved changes</span>
        <OpButton variant="ghost" @click="closeEdit">{{ canEdit ? 'Cancel' : 'Close' }}</OpButton>
        <OpButton v-if="canEdit" :disabled="saving || !edit.name.trim() || !editDirty" @click="save">{{ saving ? 'Saving…' : 'Save' }}</OpButton>
      </template>
    </TplDialog>

    <TplDialog :open="showNew" title="New data source" @close="showNew = false">
      <form ref="newForm" class="space-y-3" @submit.prevent="create">
        <OpInput v-model="draftName" label="Name" placeholder="e.g. Acme Pte Ltd" />
        <OpSelect v-if="sets.length" :model-value="copyFrom" label="Start from" :options="copyOptions" hint="A copy starts with the same keys and values, so you only change what differs." @update:model-value="onCopyFrom" />
        <p v-if="createError" role="alert" class="status-down rounded-control border px-3 py-2 text-small">{{ createError }}</p>
      </form>
      <template #footer>
        <OpButton variant="ghost" @click="showNew = false">Cancel</OpButton>
        <OpButton :disabled="creating || !draftName.trim()" @click="create">{{ creating ? 'Creating…' : 'Create and edit' }}</OpButton>
      </template>
    </TplDialog>
  </div>
</template>
