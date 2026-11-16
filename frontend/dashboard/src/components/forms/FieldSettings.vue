<script setup>
// The settings of whatever is selected in the builder: a section (title, description, condition)
// or a field (label, key, type, required / internal / sensitive, type-specific settings, options,
// condition). `loc` is { s, f?, g? } (builder.js). The schema is edited in place; renaming a key
// rewrites the conditions that look at it.
import { computed, ref, watch } from 'vue';
import OpInput from '@ds/components/OpInput.vue';
import OpSelect from '@ds/components/OpSelect.vue';
import OpTextarea from '@ds/components/OpTextarea.vue';
import ConditionEditor from './ConditionEditor.vue';
import OptionsEditor from './OptionsEditor.vue';
import {
  HAS_OPTIONS, TYPE_INFO, GROUP_FIELD_TYPES, changeType, conditionSources, groupConditionSources, groupKeys, keyProblem, mapCondKeys, relabel, renameKeyRefs, topKeys,
} from '@/helpers/forms/builder';

const props = defineProps({
  schema: { type: Object, required: true },
  loc: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
  published: { type: Boolean, default: false },
});

const section = computed(() => props.schema.sections[props.loc.s]);
const outer = computed(() => (props.loc.f === undefined ? null : section.value.fields[props.loc.f]));
const inGroup = computed(() => props.loc.g !== undefined);
const field = computed(() => (inGroup.value ? outer.value.group.fields[props.loc.g] : outer.value));
const siblingKeys = computed(() => (inGroup.value ? groupKeys(outer.value.group, field.value) : topKeys(props.schema, field.value)));

// A key changed: conditions that looked at it follow. Inside a group only that group's rows look at it.
const followRename = (old, next) => {
  if (!old || old === next) return;
  if (inGroup.value) for (const gf of outer.value.group.fields) gf.visibleIf = mapCondKeys(gf.visibleIf, { [old]: next });
  else renameKeyRefs(props.schema, old, next);
};

const onLabel = (v) => {
  const old = relabel(field.value, v, siblingKeys.value);
  followRename(old, field.value.key);
};

const keyDraft = ref('');
watch(() => [field.value?.id, field.value?.key], () => { keyDraft.value = field.value?.key ?? ''; }, { immediate: true });
const keyError = computed(() => (keyDraft.value === field.value?.key ? '' : keyProblem(keyDraft.value, siblingKeys.value)));
const onKey = (v) => {
  keyDraft.value = v;
  if (keyProblem(v, siblingKeys.value) || v === field.value.key) return;
  const old = field.value.key;
  field.value.key = v;
  followRename(old, v);
};

const typeOptions = computed(() => TYPE_INFO.filter((t) => !inGroup.value || GROUP_FIELD_TYPES.includes(t.type)).map((t) => ({ value: t.type, label: t.label })));
const onType = (type) => { changeType(field.value, type, { inGroup: inGroup.value }); };

const flag = (name, on) => { if (on) field.value[name] = true; else delete field.value[name]; };
const text = (obj, name, v) => { if (v === '' || v == null) delete obj[name]; else obj[name] = v; };
const num = (obj, name, v) => { const n = Number(v); if (v === '' || v == null || !Number.isFinite(n)) delete obj[name]; else obj[name] = n; };

const sectionInternal = computed(() => section.value.fields.length > 0 && section.value.fields.every((f) => f.internal));
const sources = computed(() => {
  if (props.loc.f === undefined) return conditionSources(props.schema, { s: props.loc.s }, { subjectInternal: sectionInternal.value });
  if (inGroup.value) return groupConditionSources(outer.value.group, props.loc.g);
  return conditionSources(props.schema, { s: props.loc.s, f: props.loc.f }, { subjectInternal: !!field.value.internal });
});
const setCond = (target, cond) => { if (cond) target.visibleIf = cond; else delete target.visibleIf; };
const check = 'size-4 accent-cyan';
</script>

<template>
  <fieldset :disabled="readonly" class="m-0 min-w-0 space-y-4 border-0 p-0">
    <!-- A section -->
    <template v-if="loc.f === undefined">
      <p class="eyebrow">Section</p>
      <OpInput v-model="section.title" label="Title" required />
      <OpTextarea :model-value="section.description ?? ''" label="Description" hint="Shown under the title. Optional." :rows="2" @update:model-value="text(section, 'description', $event)" />
      <div>
        <p class="mb-1.5 text-small font-medium text-ink-muted">Visibility</p>
        <ConditionEditor :model-value="section.visibleIf" :sources="sources" :readonly="readonly" noun="section" @update:model-value="setCond(section, $event)" />
      </div>
    </template>

    <!-- A field -->
    <template v-else-if="field">
      <p class="eyebrow">{{ inGroup ? 'Field in the list' : 'Field' }}</p>
      <OpInput :model-value="field.label" label="Label" required @update:model-value="onLabel" />
      <OpInput
        :model-value="keyDraft"
        label="Key"
        mono
        :error="keyError"
        :hint="keyError ? '' : published ? 'The name used for this answer in documents. Documents already built on the old key need updating if you change it.' : 'The name used for this answer in documents.'"
        @update:model-value="onKey"
      />
      <OpSelect :model-value="field.type" label="Type" :options="typeOptions" @update:model-value="onType" />
      <OpTextarea :model-value="field.help ?? ''" label="Help text" hint="Shown under the field. Optional." :rows="2" @update:model-value="text(field, 'help', $event)" />

      <div class="space-y-2">
        <label v-if="field.type !== 'signature'" class="flex items-start gap-2 text-body text-ink">
          <input type="checkbox" :class="[check, 'mt-0.5']" :checked="!!field.required" @change="flag('required', $event.target.checked)" />
          <span>Required<span class="block text-small text-ink-faint">{{ field.type === 'group' ? 'At least one row is needed to submit.' : 'Must be answered before the form can be submitted.' }}</span></span>
        </label>
        <p v-else class="text-small text-ink-faint">A signature is always required: the customer types their name and ticks the consent box.</p>
        <label v-if="!inGroup" class="flex items-start gap-2 text-body text-ink">
          <input type="checkbox" :class="[check, 'mt-0.5']" :checked="!!field.internal" @change="flag('internal', $event.target.checked)" />
          <span>Officer use only<span class="block text-small text-ink-faint">Hidden from customers who fill the form through a link. Fields shown to customers can't depend on it.</span></span>
        </label>
        <label class="flex items-start gap-2 text-body text-ink">
          <input type="checkbox" :class="[check, 'mt-0.5']" :checked="!!field.sensitive" @change="flag('sensitive', $event.target.checked)" />
          <span>Sensitive<span class="block text-small text-ink-faint">Marks personal data such as ID numbers. Every change to it is still recorded in Activity.</span></span>
        </label>
      </div>

      <div v-if="field.type === 'number'" class="grid grid-cols-2 gap-3">
        <OpInput :model-value="field.min ?? ''" label="Minimum" type="number" @update:model-value="num(field, 'min', $event)" />
        <OpInput :model-value="field.max ?? ''" label="Maximum" type="number" @update:model-value="num(field, 'max', $event)" />
      </div>
      <OpInput v-if="field.type === 'text' || field.type === 'longtext'" :model-value="field.maxLength ?? ''" label="Longest answer (characters)" type="number" :hint="field.type === 'text' ? 'Up to 500.' : 'Up to 10,000.'" @update:model-value="num(field, 'maxLength', $event)" />

      <div v-if="HAS_OPTIONS.includes(field.type) && field.options">
        <p class="mb-1.5 text-small font-medium text-ink-muted">{{ field.type === 'checklist' ? 'Questions' : 'Options' }}</p>
        <OptionsEditor :options="field.options" :readonly="readonly" :noun="field.type === 'checklist' ? 'question' : 'option'" />
      </div>

      <div v-if="field.type === 'group' && field.group" class="grid grid-cols-2 gap-3">
        <OpInput :model-value="field.group.min ?? ''" label="Fewest rows" type="number" @update:model-value="num(field.group, 'min', $event)" />
        <OpInput :model-value="field.group.max ?? ''" label="Most rows" type="number" hint="Up to 200." @update:model-value="num(field.group, 'max', $event)" />
        <p class="col-span-2 text-small text-ink-faint">The list's fields are shown in the middle: select one to edit it.</p>
      </div>

      <div>
        <p class="mb-1.5 text-small font-medium text-ink-muted">Visibility</p>
        <ConditionEditor :model-value="field.visibleIf" :sources="sources" :readonly="readonly" noun="field" @update:model-value="setCond(field, $event)" />
      </div>
    </template>
  </fieldset>
</template>
