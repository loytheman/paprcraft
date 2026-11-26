<script setup>
// The template's placeholders. The template only names its {{KEY}} chips; their values come from a
// value set (Settings > Value sets) picked here, so switching the set switches every value. Edits
// here change the selected set, and are saved with the template. Add, rename (updates every chip),
// remove, and bulk Reset / Capitalise / Trim of the set's values.
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { BUILTIN_KEYS, normalizeKey, placeholderUsage } from '@/helpers/template/blocks';

const props = defineProps({
  placeholders: { type: Object, required: true }, // the template's keys (KEY -> legacy value saved on the template, usually '')
  values: { type: Object, default: null }, // the selected set's values, edited in place (null = no set chosen)
  sets: { type: Array, default: null }, // the account's value sets (null = this editor has none: a master template)
  setId: { type: String, default: '' },
  setsError: { type: String, default: '' },
  legacyCount: { type: Number, default: 0 }, // values still saved on the template itself, from before value sets
  sections: { type: Array, required: true },
  frame: { type: Object, default: null }, // the page header / footer (their {{tokens}} count as used)
  formKeys: { type: Object, default: null }, // Set of the keys the template's form defines
  readonly: { type: Boolean, default: false },
});
const emit = defineEmits(['add', 'rename', 'remove', 'select-set', 'new-set', 'move-legacy']);

const chip = (k) => `{{${k}}}`;
const keys = computed(() => Object.keys(props.placeholders));
const usage = computed(() => placeholderUsage(props.sections, props.frame));
// Keys used in the text that this list doesn't hold: fields of the form (filled from a submission), or leftovers.
const others = computed(() => Object.entries(usage.value).filter(([k]) => !(k in props.placeholders)).map(([k, n]) => ({ key: k, n, form: !!props.formKeys?.has(k.split('.')[0]) || /[a-z.#]/.test(k), builtin: BUILTIN_KEYS.has(k) })));
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

const reset = () => { for (const k of keys.value) props.values[k] = ''; };
const capitalise = () => { for (const k of keys.value) props.values[k] = String(props.values[k] ?? '').toUpperCase(); };
const trim = () => { for (const k of keys.value) props.values[k] = String(props.values[k] ?? '').replace(/\s+/g, ' ').trim(); };

// New set, named inline.
const naming = ref(false);
const newName = ref('');
const startNew = () => { naming.value = true; newName.value = ''; };
const finishNew = () => {
  const name = newName.value.trim();
  naming.value = false;
  if (name) emit('new-set', name);
};
const onSelect = (v) => {
  if (v === '__new') { startNew(); return; }
  emit('select-set', v);
};
</script>

<template>
  <section class="rounded-card border border-line bg-surface-2 p-4" aria-label="Placeholders">
    <div class="flex items-start justify-between gap-2">
      <div>
        <h2 class="text-h3 text-ink">Placeholders</h2>
        <p class="mt-0.5 text-small text-ink-faint">Insert <span v-pre>{{KEY}}</span> chips in the text. Their values come from the value set you pick.</p>
      </div>
    </div>

    <!-- Value set -->
    <div v-if="sets" class="mt-3">
      <label for="tpl-value-set" class="text-small font-medium text-ink-muted">Value set</label>
      <form v-if="naming" class="mt-1 flex gap-2" @submit.prevent="finishNew">
        <input v-model="newName" placeholder="e.g. Acme Pte Ltd" aria-label="New value set name" class="h-9 min-w-0 flex-1 rounded-control border border-primary bg-surface-1 px-3 text-body text-ink focus:outline-none" @keydown.esc="naming = false" />
        <OpButton type="submit" size="sm" :disabled="!newName.trim()">Create</OpButton>
      </form>
      <select v-else id="tpl-value-set" :value="setId" :disabled="readonly" class="mt-1 h-9 w-full rounded-control border border-line bg-surface-1 px-2 text-body text-ink focus:border-primary focus:outline-none disabled:opacity-60" @change="onSelect($event.target.value)">
        <option value="">None</option>
        <option v-if="setId && !sets.some((s) => s.id === setId)" :value="setId">Deleted set (pick another)</option>
        <option v-for="s in sets" :key="s.id" :value="s.id">{{ s.name }}</option>
        <option v-if="!readonly" value="__new">+ New value set…</option>
      </select>
      <p v-if="setsError" role="alert" class="mt-1 text-small text-down">{{ setsError }}</p>
      <p class="mt-1 text-small text-ink-faint">
        Changes to values here are saved to the set, so every template using it sees them.
        <RouterLink :to="{ name: 'value-sets' }" class="underline">Manage sets</RouterLink>
      </p>
    </div>

    <div v-if="legacyCount && sets && !readonly" class="status-warn mt-3 rounded-control border px-3 py-2 text-small">
      {{ legacyCount }} {{ legacyCount === 1 ? 'value is' : 'values are' }} still saved on this template.
      <button type="button" class="underline" @click="emit('move-legacy')">Move them into a new value set</button>
    </div>

    <div v-if="values && !readonly" class="mt-3 flex flex-wrap gap-1.5">
      <OpButton size="sm" variant="secondary" :disabled="!keys.length" @click="reset">Reset values</OpButton>
      <OpButton size="sm" variant="secondary" :disabled="!keys.length" @click="capitalise">Capitalise</OpButton>
      <OpButton size="sm" variant="secondary" :disabled="!keys.length" @click="trim">Trim spaces</OpButton>
    </div>

    <p v-if="!keys.length" class="mt-4 text-body text-ink-muted">No placeholders yet. Select text in the editor and press <span v-pre class="font-mono">{{x}}</span>, or add a key below.</p>

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
              <button v-if="!readonly" type="button" class="p-1 hover:text-ink" title="Rename" aria-label="Rename key" @click="startRename(k)"><OpIcon name="pencil" :size="13" /></button>
              <button v-if="!readonly" type="button" class="p-1 hover:text-down" title="Remove" aria-label="Remove key" @click="emit('remove', k)"><OpIcon name="trash" :size="13" /></button>
            </span>
          </template>
        </div>
        <input
          v-if="values"
          v-model="values[k]"
          :readonly="readonly"
          :aria-label="`Value for ${k}`"
          placeholder="Value"
          class="mt-1 h-9 w-full rounded-control border border-line bg-surface-1 px-3 text-body text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
        />
      </li>
    </ul>
    <p v-if="keys.length && !values && sets" class="mt-2 text-small text-ink-faint">Pick a value set above to give these keys values.</p>

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
