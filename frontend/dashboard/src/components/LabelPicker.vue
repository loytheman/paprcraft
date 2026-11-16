<script setup>
// Picks a record's labels (v-model = label ids) and can create a new label inline.
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import OpLabel from '@ds/components/OpLabel.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import LabelColorPicker from '@/components/LabelColorPicker.vue';
import * as LabelService from '@/services/service.label';

const MAX = 10; // LABELS_PER_RECORD in backend/api/src/models/model.label.js
const model = defineModel({ type: Array, default: () => [] });

const labels = ref([]);
const creating = ref(false);
const draft = ref({ name: '', color: 'cyan' });
const error = ref('');
const saving = ref(false);

// The API refuses a label over the plan's limit (402 with a message), shown as the error below.
const startCreating = () => { creating.value = true; };

onMounted(async () => {
  try {
    labels.value = await LabelService.getLabels();
  } catch {
    error.value = 'Could not load your labels.';
  }
});

const selected = computed(() => new Set(model.value));
const full = computed(() => model.value.length >= MAX);
const toggle = (id) => {
  if (selected.value.has(id)) model.value = model.value.filter((x) => x !== id);
  else if (!full.value) model.value = [...model.value, id];
};

const create = async () => {
  saving.value = true;
  error.value = '';
  try {
    const l = await LabelService.createLabel({ name: draft.value.name.trim(), color: draft.value.color });
    labels.value = [...labels.value, l].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    if (!full.value) model.value = [...model.value, l.id];
    draft.value = { name: '', color: draft.value.color };
    creating.value = false;
  } catch (e) {
    error.value = e.fieldErrors?.[0]?.message || e.message || 'Could not create the label.';
  }
  saving.value = false;
};
</script>

<template>
  <fieldset>
    <legend class="text-small font-medium text-ink-muted">Labels</legend>
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <button
        v-for="l in labels"
        :key="l.id"
        type="button"
        :aria-pressed="selected.has(l.id)"
        :disabled="!selected.has(l.id) && full"
        class="rounded-full transition-opacity disabled:cursor-not-allowed"
        :class="selected.has(l.id) ? 'opacity-100' : 'opacity-45 hover:opacity-80'"
        @click="toggle(l.id)"
      >
        <OpLabel :name="l.name" :color="l.color">
          <OpIcon v-if="selected.has(l.id)" name="check" :size="12" />
        </OpLabel>
      </button>
      <button v-if="!creating" type="button" class="text-small text-primary-text hover:underline" @click="startCreating">+ New label</button>
    </div>

    <div v-if="creating" class="mt-3 flex flex-wrap items-center gap-3 rounded-card border border-line-soft bg-surface-1 p-3">
      <input
        v-model="draft.name"
        type="text"
        maxlength="30"
        placeholder="e.g. production"
        aria-label="New label name"
        class="h-9 w-44 rounded-control border border-line bg-surface-1 px-3 text-body text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
        @keydown.enter.prevent="draft.name.trim() && create()"
      />
      <LabelColorPicker v-model="draft.color" label="New label colour" />
      <OpLabel v-if="draft.name.trim()" :name="draft.name.trim()" :color="draft.color" />
      <div class="flex gap-2">
        <button type="button" class="h-8 rounded-control bg-primary px-3 text-small font-medium text-on-primary disabled:opacity-40" :disabled="saving || !draft.name.trim()" @click="create">{{ saving ? 'Adding…' : 'Add' }}</button>
        <button type="button" class="h-8 px-2 text-small text-ink-muted hover:text-ink" @click="creating = false; error = ''">Cancel</button>
      </div>
    </div>

    <p class="mt-1.5 text-small" :class="error ? 'text-down' : 'text-ink-faint'">
      <template v-if="error">{{ error }}</template>
      <template v-else>
        For your own filtering. Up to {{ MAX }} per record.
        <RouterLink :to="{ name: 'labels' }" class="text-primary-text hover:underline">Manage labels</RouterLink>
      </template>
    </p>
  </fieldset>
</template>
