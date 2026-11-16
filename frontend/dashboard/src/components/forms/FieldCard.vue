<script setup>
// The centre column of the builder: the selected section's fields as cards (what the customer will
// see, roughly), each with its flags, a short sketch of the control, and move / duplicate / delete.
// A repeating group lists its own fields inside its card. Selecting a card puts its settings in the
// right-hand column. All changes are emitted; FormBuilder.vue applies them to the schema.
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import TplMenu from '@/components/template/TplMenu.vue';
import { GROUP_FIELD_TYPES, TYPE_INFO, describeCondition, typeLabel } from '@/helpers/forms/builder';

const props = defineProps({
  schema: { type: Object, required: true },
  s: { type: Number, required: true }, // the section shown
  sel: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
});
const emit = defineEmits(['select', 'add-field', 'move', 'duplicate', 'remove', 'add-inner', 'move-inner', 'remove-inner']);

const section = () => props.schema.sections[props.s];
const isSel = (f, g) => props.sel.s === props.s && props.sel.f === f && props.sel.g === g;
const addItems = (inner) =>
  TYPE_INFO.filter((t) => inner === undefined || GROUP_FIELD_TYPES.includes(t.type)).map((t) => ({ label: t.label, action: () => (inner === undefined ? emit('add-field', t.type) : emit('add-inner', inner, t.type)) }));
const iconBtn = 'text-ink-faint hover:text-ink disabled:opacity-30';
</script>

<template>
  <div>
    <ul class="space-y-3">
      <li
        v-for="(f, i) in section().fields"
        :key="f.id"
        :class="['rounded-card border bg-surface-2 p-4', isSel(i, undefined) ? 'border-cyan/60' : 'border-line hover:border-line-strong']"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <button type="button" class="min-w-0 flex-1 text-left" @click="emit('select', { s, f: i })">
            <span class="block truncate text-body font-medium text-ink">{{ f.label }}<span v-if="f.required" class="text-cyan"> *</span></span>
            <span class="mt-0.5 flex flex-wrap items-center gap-1.5 text-small text-ink-faint">
              <span class="font-mono text-label uppercase">{{ typeLabel(f.type) }}</span>
              <span class="font-mono">{{ f.key }}</span>
              <span v-if="f.internal" class="rounded-full border border-violet/40 px-1.5 text-label text-violet-soft">Officer only</span>
              <span v-if="f.sensitive" class="rounded-full border border-warn/40 px-1.5 text-label text-warn">Sensitive</span>
              <span v-if="f.visibleIf" class="rounded-full border border-line px-1.5 text-label text-ink-muted" :title="describeCondition(f.visibleIf, schema)">Conditional</span>
            </span>
          </button>
          <div v-if="!readonly" class="flex items-center gap-1.5">
            <button type="button" :class="iconBtn" :disabled="i === 0" :aria-label="`Move ${f.label} up`" @click="emit('move', i, i - 1)"><OpIcon name="arrow-left" :size="14" class="rotate-90" /></button>
            <button type="button" :class="iconBtn" :disabled="i === section().fields.length - 1" :aria-label="`Move ${f.label} down`" @click="emit('move', i, i + 1)"><OpIcon name="arrow-left" :size="14" class="-rotate-90" /></button>
            <button type="button" :class="iconBtn" :aria-label="`Duplicate ${f.label}`" @click="emit('duplicate', i)"><OpIcon name="copy" :size="14" /></button>
            <button type="button" class="text-ink-faint hover:text-down" :aria-label="`Delete ${f.label}`" @click="emit('remove', i)"><OpIcon name="trash" :size="14" /></button>
          </div>
        </div>

        <p v-if="f.help" class="mt-1 text-small text-ink-muted">{{ f.help }}</p>
        <p v-if="f.visibleIf" class="mt-1 text-small text-ink-faint">Shown when {{ describeCondition(f.visibleIf, schema) }}</p>

        <!-- A sketch of the control -->
        <div class="mt-3 text-small text-ink-faint" aria-hidden="true">
          <div v-if="['text', 'email', 'phone', 'country', 'date', 'number'].includes(f.type)" class="h-9 rounded-control border border-line bg-sunken" />
          <div v-else-if="f.type === 'longtext'" class="h-16 rounded-control border border-line bg-sunken" />
          <div v-else-if="f.type === 'select'" class="flex h-9 items-center justify-between rounded-control border border-line bg-sunken px-3">{{ f.options?.[0]?.label ?? 'Choose…' }}<span>▾</span></div>
          <div v-else-if="f.type === 'multiselect'" class="flex flex-wrap gap-2"><span v-for="o in f.options" :key="o.value" class="rounded-control border border-line px-2 py-0.5">☐ {{ o.label }}</span></div>
          <div v-else-if="f.type === 'yesno'" class="flex gap-3"><span class="rounded-control border border-line px-3 py-0.5">Yes</span><span class="rounded-control border border-line px-3 py-0.5">No</span></div>
          <ul v-else-if="f.type === 'checklist'" class="space-y-1"><li v-for="o in f.options" :key="o.value" class="flex items-center justify-between rounded-control border border-line-soft px-2 py-1"><span>{{ o.label }}</span><span>Yes / No</span></li></ul>
          <div v-else-if="f.type === 'file'" class="rounded-control border border-dashed border-line px-3 py-3 text-center">Upload a file (PNG, JPEG, WebP or PDF)</div>
          <div v-else-if="f.type === 'signature'" class="rounded-control border border-line bg-sunken px-3 py-2">Type your name ✓ I agree</div>
        </div>

        <!-- A group's own fields -->
        <div v-if="f.type === 'group' && f.group" class="mt-3 rounded-control border border-line-soft bg-surface-1 p-2">
          <p class="px-1 pb-1 font-mono text-label uppercase text-ink-faint">Each row has</p>
          <ul class="space-y-1">
            <li
              v-for="(g, j) in f.group.fields"
              :key="g.id"
              :class="['flex items-center justify-between gap-2 rounded-control border px-2 py-1', isSel(i, j) ? 'border-cyan/60 bg-surface-3' : 'border-transparent hover:bg-white/4']"
            >
              <button type="button" class="min-w-0 flex-1 truncate text-left text-small text-ink" @click="emit('select', { s, f: i, g: j })">
                {{ g.label }}<span v-if="g.required" class="text-cyan"> *</span>
                <span class="ml-1.5 font-mono text-label text-ink-faint">{{ typeLabel(g.type) }}</span>
                <span v-if="g.visibleIf" class="ml-1 text-label text-ink-faint">(if)</span>
              </button>
              <template v-if="!readonly">
                <button type="button" :class="iconBtn" :disabled="j === 0" :aria-label="`Move ${g.label} up`" @click="emit('move-inner', i, j, j - 1)"><OpIcon name="arrow-left" :size="13" class="rotate-90" /></button>
                <button type="button" :class="iconBtn" :disabled="j === f.group.fields.length - 1" :aria-label="`Move ${g.label} down`" @click="emit('move-inner', i, j, j + 1)"><OpIcon name="arrow-left" :size="13" class="-rotate-90" /></button>
                <button type="button" class="text-ink-faint hover:text-down disabled:opacity-30" :disabled="f.group.fields.length <= 1" :aria-label="`Delete ${g.label}`" @click="emit('remove-inner', i, j)"><OpIcon name="trash" :size="13" /></button>
              </template>
            </li>
          </ul>
          <TplMenu v-if="!readonly" class="mt-1" icon="plus" label="Add a field to each row" :items="addItems(i)" />
        </div>
      </li>
    </ul>

    <p v-if="!section().fields.length" class="rounded-card border border-dashed border-line px-6 py-8 text-center text-body text-ink-muted">This section has no fields yet.</p>
    <div v-if="!readonly" class="mt-3">
      <TplMenu icon="plus" label="Add a field" :items="addItems()" button-class="!h-10 !border-line-strong !px-4 !text-body !text-ink" />
    </div>
  </div>
</template>
