<script setup>
// The template's placeholders: KEY -> value. Chips in the text ({{KEY}}) show the value live, and
// the document is generated with these values (the export can override them). Add, rename (updates
// every chip), remove, and bulk Reset / Capitalise / Trim.
import { computed, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { normalizeKey, placeholderUsage } from '@/helpers/template/blocks';

const props = defineProps({
  placeholders: { type: Object, required: true },
  sections: { type: Array, required: true },
  readonly: { type: Boolean, default: false },
});
const emit = defineEmits(['add', 'rename', 'remove']);

const chip = (k) => `{{${k}}}`;
const keys = computed(() => Object.keys(props.placeholders));
const usage = computed(() => placeholderUsage(props.sections));
const draftKey = ref('');
const error = ref('');

const add = () => {
  const key = normalizeKey(draftKey.value);
  if (!key) { error.value = 'Use letters and numbers, e.g. COMPANY_NAME.'; return; }
  if (key in props.placeholders) { error.value = `${key} already exists.`; return; }
  error.value = '';
  emit('add', key);
  draftKey.value = '';
};

const renaming = ref(null);
const renameDraft = ref('');
const startRename = (k) => { renaming.value = k; renameDraft.value = k; error.value = ''; };
const finishRename = () => {
  const to = normalizeKey(renameDraft.value);
  const from = renaming.value;
  renaming.value = null;
  if (!to || to === from) return;
  if (to in props.placeholders) { error.value = `${to} already exists.`; return; }
  emit('rename', from, to);
};

const reset = () => { for (const k of keys.value) props.placeholders[k] = ''; };
const capitalise = () => { for (const k of keys.value) props.placeholders[k] = String(props.placeholders[k] ?? '').toUpperCase(); };
const trim = () => { for (const k of keys.value) props.placeholders[k] = String(props.placeholders[k] ?? '').replace(/\s+/g, ' ').trim(); };
</script>

<template>
  <section class="rounded-card border border-line bg-surface-2 p-4" aria-label="Placeholders">
    <div class="flex items-start justify-between gap-2">
      <div>
        <h2 class="text-h3 text-ink">Placeholders</h2>
        <p class="mt-0.5 text-small text-ink-faint">Insert <span v-pre>{{KEY}}</span> chips in the text, then give each key its value here.</p>
      </div>
    </div>

    <div v-if="!readonly" class="mt-3 flex flex-wrap gap-1.5">
      <OpButton size="sm" variant="secondary" :disabled="!keys.length" @click="reset">Reset values</OpButton>
      <OpButton size="sm" variant="secondary" :disabled="!keys.length" @click="capitalise">Capitalise</OpButton>
      <OpButton size="sm" variant="secondary" :disabled="!keys.length" @click="trim">Trim spaces</OpButton>
    </div>

    <p v-if="!keys.length" class="mt-4 text-body text-ink-muted">No placeholders yet. Select text in the editor and press <span v-pre class="font-mono">{{x}}</span>, or add a key below.</p>

    <ul class="mt-3 space-y-3">
      <li v-for="k in keys" :key="k">
        <div class="flex items-center justify-between gap-2">
          <template v-if="renaming === k">
            <input v-model="renameDraft" class="min-w-0 flex-1 rounded-control border border-cyan bg-sunken px-2 py-1 font-mono text-small text-ink focus:outline-none" @keydown.enter.prevent="finishRename" @keydown.esc="renaming = null" @blur="finishRename" />
          </template>
          <template v-else>
            <span class="min-w-0 truncate font-mono text-small text-ink">{{ chip(k) }}</span>
            <span class="flex items-center gap-1 text-ink-faint">
              <span class="text-small">{{ usage[k] ?? 0 }}×</span>
              <button v-if="!readonly" type="button" class="p-1 hover:text-ink" title="Rename" aria-label="Rename key" @click="startRename(k)"><OpIcon name="pencil" :size="13" /></button>
              <button v-if="!readonly" type="button" class="p-1 hover:text-down" title="Remove" aria-label="Remove key" @click="emit('remove', k)"><OpIcon name="trash" :size="13" /></button>
            </span>
          </template>
        </div>
        <input
          v-model="placeholders[k]"
          :readonly="readonly"
          :aria-label="`Value for ${k}`"
          placeholder="Value"
          class="mt-1 h-9 w-full rounded-control border border-line bg-sunken px-3 text-body text-ink placeholder:text-ink-faint focus:border-cyan focus:outline-none"
        />
      </li>
    </ul>

    <form v-if="!readonly" class="mt-4 flex gap-2" @submit.prevent="add">
      <input v-model="draftKey" placeholder="NEW_KEY" aria-label="New placeholder key" class="h-9 min-w-0 flex-1 rounded-control border border-line bg-sunken px-3 font-mono text-small text-ink placeholder:text-ink-faint focus:border-cyan focus:outline-none" />
      <OpButton type="submit" size="sm" icon="plus" :disabled="!draftKey.trim()">Add</OpButton>
    </form>
    <p v-if="error" role="alert" class="mt-2 text-small text-down">{{ error }}</p>
  </section>
</template>
