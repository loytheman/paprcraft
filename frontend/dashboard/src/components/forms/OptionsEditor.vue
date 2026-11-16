<script setup>
// The options of a single choice, multiple choice or checklist field: label + value, reorder, remove.
// The value follows the label until it is edited by hand (builder.js optionValueFor). `options` is
// edited in place.
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { moveItem, newOption, optionValueFor } from '@/helpers/forms/builder';

const props = defineProps({
  options: { type: Array, required: true },
  readonly: { type: Boolean, default: false },
  noun: { type: String, default: 'option' }, // "option" | "question"
});

const setLabel = (o, label) => {
  const auto = o.value === optionValueFor(o.label, props.options, o);
  o.label = label;
  if (auto) o.value = optionValueFor(label, props.options, o);
};
const add = () => props.options.push(newOption(props.options));
const remove = (i) => { if (props.options.length > 1) props.options.splice(i, 1); };
const dupes = (o) => props.options.filter((x) => x.value === o.value).length > 1;
const cls = 'h-9 min-w-0 rounded-control border bg-surface-1 px-2 text-small text-ink focus:border-primary focus:outline-none disabled:opacity-60';
</script>

<template>
  <div>
    <ul class="space-y-1.5">
      <li v-for="(o, i) in options" :key="i" class="flex items-center gap-1.5">
        <input :value="o.label" :disabled="readonly" :class="[cls, 'flex-1 border-line']" :aria-label="`Label of ${noun} ${i + 1}`" @input="setLabel(o, $event.target.value)" />
        <input v-model="o.value" :disabled="readonly" :class="[cls, 'w-28 font-mono', dupes(o) ? 'border-down' : 'border-line']" :aria-label="`Value of ${noun} ${i + 1}`" title="Stored value (letters, digits, _ . -)" />
        <template v-if="!readonly">
          <button type="button" class="text-ink-faint hover:text-ink disabled:opacity-30" :disabled="i === 0" aria-label="Move up" @click="moveItem(options, i, i - 1)"><OpIcon name="arrow-left" :size="14" class="rotate-90" /></button>
          <button type="button" class="text-ink-faint hover:text-ink disabled:opacity-30" :disabled="i === options.length - 1" aria-label="Move down" @click="moveItem(options, i, i + 1)"><OpIcon name="arrow-left" :size="14" class="-rotate-90" /></button>
          <button type="button" class="text-ink-faint hover:text-down disabled:opacity-30" :disabled="options.length <= 1" :aria-label="`Remove ${noun}`" @click="remove(i)"><OpIcon name="x" :size="14" /></button>
        </template>
      </li>
    </ul>
    <OpButton v-if="!readonly" class="mt-2" size="sm" variant="secondary" icon="plus" @click="add">Add {{ noun }}</OpButton>
  </div>
</template>
