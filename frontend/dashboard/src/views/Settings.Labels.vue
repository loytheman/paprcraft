<script setup>
// The account's labels: create, rename, recolour, delete (service.label.js). Add your own record
// types' usage counts here when records start using labelIds.
import { computed, onMounted, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import RowMenu from '@/components/RowMenu.vue';
import { ROW_CLICKABLE, onRow } from '@/helpers/rowClick';
import OpInput from '@ds/components/OpInput.vue';
import OpLabel from '@ds/components/OpLabel.vue';
import LabelColorPicker from '@/components/LabelColorPicker.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import * as LabelService from '@/services/service.label';
import { askConfirm } from '@/helpers/Confirm';
import { canEdit } from '@/team';

const labels = ref([]);
const loaded = ref(false);
const loadError = ref('');

const load = async () => {
  try {
    labels.value = await LabelService.getLabels();
    loadError.value = '';
  } catch (e) {
    loadError.value = e.message || 'Could not load your labels.';
  }
  loaded.value = true;
};
onMounted(load);

// New label
const draft = ref({ name: '', color: 'cyan' });
const createError = ref('');
const creating = ref(false);
const create = async () => {
  creating.value = true;
  createError.value = '';
  try {
    await LabelService.createLabel({ name: draft.value.name.trim(), color: draft.value.color });
    draft.value = { name: '', color: draft.value.color };
    await load();
  } catch (e) {
    createError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not create the label.';
  }
  creating.value = false;
};

// Edit in place, one row at a time
const editing = ref(null);
const edit = ref({ name: '', color: 'cyan' });
const rowError = ref('');
const saving = ref(false);
const startEdit = (l) => {
  editing.value = l.id;
  edit.value = { name: l.name, color: l.color };
  rowError.value = '';
};
const save = async () => {
  saving.value = true;
  rowError.value = '';
  try {
    await LabelService.updateLabel(editing.value, { name: edit.value.name.trim(), color: edit.value.color });
    editing.value = null;
    await load();
  } catch (e) {
    rowError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not save the label.';
  }
  saving.value = false;
};
const remove = async (l) => {
  const ok = await askConfirm({
    title: `Delete the label "${l.name}"?`,
    message: 'It is removed everywhere it is used.',
    confirmLabel: 'Delete label',
  });
  if (!ok) return;
  try {
    await LabelService.deleteLabel(l.id);
    await load();
  } catch (e) {
    loadError.value = e.message || 'Could not delete the label.';
  }
};
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <p class="eyebrow">Settings</p>
    <h1 class="mt-2 text-h2 text-ink">Labels</h1>
    <p class="mt-2 text-body text-ink-muted">
      Tag your records to find them quickly. Labels are shared with everyone on your account.
    </p>

    <p v-if="loadError" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ loadError }}</p>

    <PageSkeleton v-if="!loaded" kind="form" class="mt-8" />

    <template v-else>
      <form v-if="canEdit" class="mt-8 space-y-4 rounded-sheet border border-line bg-surface-2 p-6" @submit.prevent="create">
        <h2 class="text-h3 text-ink">New label</h2>
        <div class="flex flex-wrap items-end gap-4">
          <OpInput v-model="draft.name" class="w-56" label="Name" placeholder="e.g. production" :error="createError" />
          <div class="flex flex-col gap-1.5">
            <span class="text-small font-medium text-ink-muted">Colour</span>
            <LabelColorPicker v-model="draft.color" />
          </div>
          <OpLabel v-if="draft.name.trim()" class="mb-2.5" :name="draft.name.trim()" :color="draft.color" />
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-small" :class="'text-ink-faint'">{{ labels.length }} labels</span>
          <OpButton type="submit" icon="plus" :disabled="creating || !draft.name.trim()">{{ creating ? 'Adding…' : 'Add label' }}</OpButton>
        </div>
      </form>

      <section class="mt-6 rounded-sheet border border-line bg-surface-2">
        <p v-if="!labels.length" class="px-6 py-8 text-center text-body text-ink-muted">No labels yet. Add one above.</p>
        <ul v-else>
          <li v-for="l in labels" :key="l.id" :class="['border-b border-line-faint px-5 py-3 last:border-b-0', canEdit && editing !== l.id && ROW_CLICKABLE]" @click="canEdit && editing !== l.id && onRow($event, () => startEdit(l))">
            <div v-if="editing === l.id" class="space-y-3">
              <div class="flex flex-wrap items-end gap-4">
                <OpInput v-model="edit.name" class="w-56" label="Name" :error="rowError" />
                <div class="flex flex-col gap-1.5">
                  <span class="text-small font-medium text-ink-muted">Colour</span>
                  <LabelColorPicker v-model="edit.color" />
                </div>
              </div>
              <div class="flex gap-2">
                <OpButton size="sm" :disabled="saving || !edit.name.trim()" @click="save">{{ saving ? 'Saving…' : 'Save' }}</OpButton>
                <OpButton size="sm" variant="ghost" @click="editing = null">Cancel</OpButton>
              </div>
            </div>
            <div v-else class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex min-w-0 items-center gap-3">
                <OpLabel :name="l.name" :color="l.color" />
              </div>
              <div class="flex items-center gap-1">
                <OpButton v-if="canEdit" size="sm" variant="secondary" @click="startEdit(l)">Edit</OpButton>
                <RowMenu v-if="canEdit" :label="`More actions for ${l.name}`" :items="[{ label: 'Delete', icon: 'trash', danger: true, action: () => remove(l) }]" />
              </div>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
