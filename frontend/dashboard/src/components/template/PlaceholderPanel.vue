<script setup>
// The template's placeholders. The template only names its {{KEY}} chips; their values come from the
// data source picked here (managed on the Data sources page), so switching it switches every value.
// Values are read-only here. The data source's keys are listed even before the template uses them:
// click one to put its chip at the caret. Add, rename (updates every chip) and remove keys.
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { BUILTIN_KEYS, normalizeKey, placeholderUsage, templateKeys } from '@/helpers/template/blocks';

const props = defineProps({
  placeholders: { type: Object, required: true }, // the template's keys (KEY -> legacy value saved on the template, usually '')
  values: { type: Object, default: null }, // the selected data source's values, read-only (null = none chosen)
  sets: { type: Array, default: null }, // the account's data sources (null = this editor has none: a master template)
  setId: { type: String, default: '' },
  setsError: { type: String, default: '' },
  legacyCount: { type: Number, default: 0 }, // values still saved on the template itself, from before data sources
  sections: { type: Array, required: true },
  frame: { type: Object, default: null }, // the page header / footer (their {{tokens}} count as used)
  formKeys: { type: Object, default: null }, // Set of the keys the template's form defines
  readonly: { type: Boolean, default: false },
  insertError: { type: String, default: '' }, // why the last insert failed (e.g. no caret in the text)
});
const emit = defineEmits(['add', 'rename', 'remove', 'select-set', 'move-legacy', 'insert']);

const chip = (k) => `{{${k}}}`;
// Every manual key of the template: saved in its map, or used by a chip in the text (listed from the
// start, not only once the chip is clicked).
const keys = computed(() => templateKeys(props.placeholders, props.sections, props.frame, props.formKeys));
const keySet = computed(() => new Set(keys.value));
const usage = computed(() => placeholderUsage(props.sections, props.frame));
// Keys used in the text that this list doesn't hold: fields of the form (filled from a submission), document info, or leftovers.
const others = computed(() => Object.entries(usage.value).filter(([k]) => !keySet.value.has(k)).map(([k, n]) => ({ key: k, n, form: !!props.formKeys?.has(k.split('.')[0]) || /[a-z.#]/.test(k), builtin: BUILTIN_KEYS.has(k) })));
// The selected data source's keys this template doesn't have yet, ready to insert.
const setName = computed(() => props.sets?.find((s) => s.id === props.setId)?.name ?? '');
const available = computed(() => Object.keys(props.values ?? {}).filter((k) => !keySet.value.has(k)).sort());
const draftKey = ref('');
const error = ref('');

const add = () => {
  const key = normalizeKey(draftKey.value);
  if (!key) { error.value = 'Use letters and numbers, e.g. COMPANY_NAME.'; return; }
  if (keySet.value.has(key)) { error.value = `${key} already exists.`; return; }
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
  if (keySet.value.has(to)) { error.value = `${to} already exists.`; return; }
  emit('rename', from, to);
};

</script>

<template>
  <section class="rounded-card border border-line bg-surface-2 p-4" aria-label="Placeholders">
    <div class="flex items-start justify-between gap-2">
      <div>
        <h2 class="text-h3 text-ink">Placeholders</h2>
        <p class="mt-0.5 text-small text-ink-faint">Insert <span v-pre>{{KEY}}</span> chips in the text. Their values come from the data source you pick.</p>
      </div>
    </div>

    <!-- Data source -->
    <div v-if="sets" class="mt-3">
      <label for="tpl-value-set" class="text-small font-medium text-ink-muted">Data source</label>
      <select id="tpl-value-set" :value="setId" :disabled="readonly" class="mt-1 h-9 w-full rounded-control border border-line bg-surface-1 px-2 text-body text-ink focus:border-primary focus:outline-none disabled:opacity-60" @change="emit('select-set', $event.target.value)">
        <option value="">None</option>
        <option v-if="setId && !sets.some((s) => s.id === setId)" :value="setId">Deleted data source (pick another)</option>
        <option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <p v-if="setsError" role="alert" class="mt-1 text-small text-down">{{ setsError }}</p>
      <p class="mt-1 text-small text-ink-faint">
        <template v-if="!sets.length">You have no data sources yet. </template>
        <RouterLink :to="{ name: 'data-sources' }" class="underline">{{ sets.length ? 'Manage data sources' : 'Create one' }}</RouterLink> to add or change values.
      </p>
    </div>

    <div v-if="legacyCount && sets && !readonly" class="status-warn mt-3 rounded-control border px-3 py-2 text-small">
      {{ legacyCount }} {{ legacyCount === 1 ? 'value is' : 'values are' }} still saved on this template.
      <button type="button" class="underline" @click="emit('move-legacy')">Copy them into a new data source</button>
    </div>

    <p v-if="!keys.length && available.length" class="mt-4 text-body text-ink-muted">No placeholders yet. Pick one from the data source below, or add a key.</p>
    <p v-else-if="!keys.length" class="mt-4 text-body text-ink-muted">No placeholders yet. Select text in the editor and press <span v-pre class="font-mono">{{x}}</span>, or add a key below.</p>

    <ul class="mt-3 space-y-3">
      <li v-for="k in keys" :key="k">
        <div class="flex items-center justify-between gap-2">
          <template v-if="renaming === k">
            <input v-model="renameDraft" class="min-w-0 flex-1 rounded-control border border-primary bg-sunken px-2 py-1 font-mono text-small text-ink focus:outline-none" @keydown.enter.prevent="finishRename" @keydown.esc="renaming = null" @blur="finishRename" />
          </template>
          <template v-else>
            <span class="min-w-0 truncate font-mono text-small text-ink">{{ chip(k) }}</span>
            <span class="flex items-center gap-1 text-ink-faint">
              <span class="text-small">{{ usage[k] ?? 0 }}×</span>
              <button v-if="!readonly" type="button" class="p-1 hover:text-ink" title="Insert at the cursor" :aria-label="`Insert ${k}`" @mousedown.prevent @click="emit('insert', k)"><OpIcon name="plus" :size="13" /></button>
              <button v-if="!readonly" type="button" class="p-1 hover:text-ink" title="Rename" aria-label="Rename key" @click="startRename(k)"><OpIcon name="pencil" :size="13" /></button>
              <button v-if="!readonly && !usage[k]" type="button" class="p-1 hover:text-down" title="Remove" aria-label="Remove key" @click="emit('remove', k)"><OpIcon name="trash" :size="13" /></button>
            </span>
          </template>
        </div>
        <p v-if="values" class="mt-1 truncate rounded-control bg-sunken px-3 py-1.5 text-body" :class="values[k] ? 'text-ink' : 'italic text-ink-faint'" :title="values[k] || ''">{{ values[k] || 'Not in this data source' }}</p>
      </li>
    </ul>
    <p v-if="keys.length && !values && sets" class="mt-2 text-small text-ink-faint">Pick a data source above to give these keys values.</p>

    <!-- The data source's other keys: insert one to start using it -->
    <div v-if="available.length" class="mt-4 border-t border-line pt-3">
      <p class="text-small font-medium text-ink-muted">More in {{ setName || 'this data source' }}</p>
      <p class="mt-0.5 text-small text-ink-faint">{{ readonly ? 'Keys this template could use.' : 'Click in the text, then pick a key to insert it there.' }}</p>
      <ul class="mt-2 space-y-1.5">
        <li v-for="k in available" :key="k">
          <button
            type="button"
            :disabled="readonly"
            class="flex w-full items-center gap-2 rounded-control border border-line bg-surface-1 px-2.5 py-1.5 text-left hover:border-primary disabled:cursor-default disabled:hover:border-line"
            :title="readonly ? '' : `Insert ${chip(k)} at the cursor`"
            @mousedown.prevent
            @click="emit('insert', k)"
          >
            <span class="shrink-0 font-mono text-small text-ink">{{ chip(k) }}</span>
            <span class="min-w-0 flex-1 truncate text-small" :class="values[k] ? 'text-ink-muted' : 'italic text-ink-faint'">{{ values[k] || 'no value' }}</span>
            <OpIcon v-if="!readonly" name="plus" :size="13" class="shrink-0 text-ink-faint" />
          </button>
        </li>
      </ul>
    </div>
    <p v-if="insertError" role="alert" class="mt-2 text-small text-down">{{ insertError }}</p>

    <div v-if="others.length" class="mt-4 border-t border-line pt-3">
      <p class="text-small font-medium text-ink-muted">Filled in automatically</p>
      <p class="mt-0.5 text-small text-ink-faint">Form fields come from a submission; document info is added when the document is generated. Chips with no tag have nothing to fill them.</p>
      <ul class="mt-2 space-y-1">
        <li v-for="o in others" :key="o.key" class="flex items-center justify-between gap-2 text-small">
          <span class="min-w-0 truncate font-mono text-ink-muted">{{ chip(o.key) }}</span>
          <span class="shrink-0 text-ink-faint">{{ o.builtin ? 'document info · ' : o.form ? 'form field · ' : '' }}{{ o.n }}×</span>
        </li>
      </ul>
    </div>

    <form v-if="!readonly" class="mt-4 flex gap-2" @submit.prevent="add">
      <input v-model="draftKey" placeholder="NEW_KEY" aria-label="New placeholder key" class="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface-1 px-3 font-mono text-small text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none" />
      <OpButton type="submit" size="sm" icon="plus" :disabled="!draftKey.trim()">Add</OpButton>
    </form>
    <p v-if="error" role="alert" class="mt-2 text-small text-down">{{ error }}</p>
  </section>
</template>
