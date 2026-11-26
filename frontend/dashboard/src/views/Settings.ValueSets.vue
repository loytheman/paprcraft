<script setup>
// The account's value sets (service.valueSet.js): named sets of placeholder values, e.g. one per
// client company. A template picks a set, and its {{KEY}} chips are filled from it, so the same
// template gives a different document per set. Create, rename, edit the values, delete.
import { onMounted, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import OpInput from '@ds/components/OpInput.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import * as ValueSetService from '@/services/service.valueSet';
import { normalizeKey } from '@/helpers/template/blocks';
import { askConfirm } from '@/helpers/Confirm';
import { canEdit } from '@/team';

const sets = ref([]);
const loaded = ref(false);
const loadError = ref('');

const load = async () => {
  try {
    sets.value = await ValueSetService.listValueSets();
    loadError.value = '';
  } catch (e) {
    loadError.value = e.message || 'Could not load your value sets.';
  }
  loaded.value = true;
};
onMounted(load);

// New set
const draftName = ref('');
const createError = ref('');
const creating = ref(false);
const create = async () => {
  creating.value = true;
  createError.value = '';
  try {
    const s = await ValueSetService.createValueSet({ name: draftName.value.trim(), values: {} });
    draftName.value = '';
    await load();
    startEdit(s);
  } catch (e) {
    createError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not create the value set.';
  }
  creating.value = false;
};

// Edit one set at a time: its name and rows of KEY / value.
const editing = ref(null);
const edit = ref({ name: '', rows: [] });
const newKey = ref('');
const rowError = ref('');
const saving = ref(false);
const startEdit = (s) => {
  editing.value = s.id;
  edit.value = { name: s.name, rows: Object.entries(s.values ?? {}).map(([key, value]) => ({ key, value })) };
  newKey.value = '';
  rowError.value = '';
};
const addRow = () => {
  const key = normalizeKey(newKey.value);
  if (!key) { rowError.value = 'Use letters and numbers, e.g. COMPANY_NAME.'; return; }
  if (edit.value.rows.some((r) => r.key === key)) { rowError.value = `${key} is already in this set.`; return; }
  rowError.value = '';
  edit.value.rows.push({ key, value: '' });
  newKey.value = '';
};
const removeRow = (i) => { edit.value.rows.splice(i, 1); };
const save = async () => {
  saving.value = true;
  rowError.value = '';
  try {
    const values = Object.fromEntries(edit.value.rows.map((r) => [r.key, String(r.value ?? '')]));
    await ValueSetService.updateValueSet(editing.value, { name: edit.value.name.trim(), values });
    editing.value = null;
    await load();
  } catch (e) {
    rowError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not save the value set.';
  }
  saving.value = false;
};
const remove = async (s) => {
  const ok = await askConfirm({
    title: `Delete the value set "${s.name}"?`,
    message: 'Templates that use it must pick another set before their next export.',
    confirmLabel: 'Delete value set',
  });
  if (!ok) return;
  try {
    await ValueSetService.deleteValueSet(s.id);
    if (editing.value === s.id) editing.value = null;
    await load();
  } catch (e) {
    loadError.value = e.message || 'Could not delete the value set.';
  }
};
const chip = (k) => `{{${k}}}`;
const count = (s) =>Object.keys(s.values ?? {}).length;
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <p class="eyebrow">Settings</p>
    <h1 class="mt-2 text-h2 text-ink">Value sets</h1>
    <p class="mt-2 text-body text-ink-muted">
      Keep the values your templates' <span v-pre class="font-mono">{{KEY}}</span> placeholders are filled with, for example one set per client.
      Pick a set in a template's Placeholders panel, or when you generate a document.
    </p>

    <p v-if="loadError" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ loadError }}</p>

    <PageSkeleton v-if="!loaded" kind="form" class="mt-8" />

    <template v-else>
      <form v-if="canEdit" class="mt-8 space-y-4 rounded-sheet border border-line bg-surface-2 p-6" @submit.prevent="create">
        <h2 class="text-h3 text-ink">New value set</h2>
        <OpInput v-model="draftName" class="max-w-sm" label="Name" placeholder="e.g. Acme Pte Ltd" :error="createError" />
        <div class="flex items-center justify-between gap-3">
          <span class="text-small text-ink-faint">{{ sets.length }} value sets</span>
          <OpButton type="submit" icon="plus" :disabled="creating || !draftName.trim()">{{ creating ? 'Adding…' : 'Add value set' }}</OpButton>
        </div>
      </form>

      <section class="mt-6 overflow-hidden rounded-sheet border border-line bg-surface-2">
        <p v-if="!sets.length" class="px-6 py-8 text-center text-body text-ink-muted">No value sets yet.<template v-if="canEdit"> Add one above.</template></p>
        <ul v-else>
          <li v-for="s in sets" :key="s.id" class="border-b border-line-faint px-5 py-3 last:border-b-0">
            <div v-if="editing === s.id" class="space-y-3">
              <OpInput v-model="edit.name" class="max-w-sm" label="Name" />
              <p v-if="!edit.rows.length" class="text-small text-ink-faint">No values yet. Add a key below, or give values in a template's Placeholders panel.</p>
              <ul class="space-y-2">
                <li v-for="(r, i) in edit.rows" :key="r.key" class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span class="truncate font-mono text-small text-ink sm:w-48 sm:shrink-0">{{ chip(r.key) }}</span>
                  <div class="flex min-w-0 flex-1 items-center gap-2">
                    <input v-model="r.value" :aria-label="`Value for ${r.key}`" placeholder="Value" class="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface-1 px-3 text-body text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none" />
                    <button type="button" class="p-1 text-ink-faint hover:text-down" :aria-label="`Remove ${r.key}`" @click="removeRow(i)"><OpIcon name="trash" :size="14" /></button>
                  </div>
                </li>
              </ul>
              <form class="flex max-w-sm gap-2" @submit.prevent="addRow">
                <input v-model="newKey" placeholder="NEW_KEY" aria-label="New key" class="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface-1 px-3 font-mono text-small text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none" />
                <OpButton type="submit" size="sm" variant="secondary" icon="plus" :disabled="!newKey.trim()">Add key</OpButton>
              </form>
              <p v-if="rowError" role="alert" class="text-small text-down">{{ rowError }}</p>
              <div class="flex gap-2">
                <OpButton v-if="canEdit" size="sm" :disabled="saving || !edit.name.trim()" @click="save">{{ saving ? 'Saving…' : 'Save' }}</OpButton>
                <OpButton size="sm" variant="ghost" @click="editing = null">{{ canEdit ? 'Cancel' : 'Close' }}</OpButton>
              </div>
            </div>
            <div v-else class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-body text-ink">{{ s.name }}</p>
                <p class="text-small text-ink-faint">{{ count(s) }} {{ count(s) === 1 ? 'value' : 'values' }}</p>
              </div>
              <div class="flex gap-2">
                <OpButton size="sm" variant="secondary" @click="startEdit(s)">{{ canEdit ? 'Edit' : 'View' }}</OpButton>
                <OpButton v-if="canEdit" size="sm" variant="destructive" icon="trash" @click="remove(s)">Delete</OpButton>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
