<script setup>
// Left column of the builder: the sections and their fields. Click to select, drag a section's
// handle (or use the arrows) to reorder, clone or delete a section.
import { ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { typeLabel } from '@/helpers/forms/builder';

const props = defineProps({
  schema: { type: Object, required: true },
  sel: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
});
const emit = defineEmits(['select', 'add-section', 'move-section', 'clone-section', 'delete-section']);

const dragFrom = ref(-1);
const onDrop = (to) => {
  if (dragFrom.value >= 0 && dragFrom.value !== to) emit('move-section', dragFrom.value, to);
  dragFrom.value = -1;
};
const isSection = (i) => props.sel.s === i && props.sel.f === undefined;
const isField = (i, j) => props.sel.s === i && props.sel.f === j && props.sel.g === undefined;
</script>

<template>
  <nav aria-label="Form outline">
    <p class="eyebrow">Outline</p>
    <ul class="mt-3 space-y-3">
      <li v-for="(sec, i) in schema.sections" :key="sec.id" @dragover.prevent @drop.prevent="onDrop(i)">
        <div :class="['flex items-center gap-1 rounded-control border px-1.5 py-1', isSection(i) ? 'border-cyan/60 bg-surface-3' : 'border-transparent hover:bg-white/4']">
          <span v-if="!readonly" class="cursor-grab text-ink-faint hover:text-ink" draggable="true" title="Drag to reorder" @dragstart="dragFrom = i"><OpIcon name="menu" :size="14" /></span>
          <button type="button" class="min-w-0 flex-1 truncate text-left text-body font-medium text-ink" @click="emit('select', { s: i })">
            {{ i + 1 }}. {{ sec.title || 'Untitled section' }}<span v-if="sec.visibleIf" class="ml-1 text-small font-normal text-ink-faint" title="Shown only when a condition holds">(if)</span>
          </button>
          <template v-if="!readonly">
            <button type="button" class="text-ink-faint hover:text-ink disabled:opacity-30" :disabled="i === 0" :aria-label="`Move section ${i + 1} up`" @click="emit('move-section', i, i - 1)"><OpIcon name="arrow-left" :size="13" class="rotate-90" /></button>
            <button type="button" class="text-ink-faint hover:text-ink disabled:opacity-30" :disabled="i === schema.sections.length - 1" :aria-label="`Move section ${i + 1} down`" @click="emit('move-section', i, i + 1)"><OpIcon name="arrow-left" :size="13" class="-rotate-90" /></button>
            <button type="button" class="text-ink-faint hover:text-ink" :aria-label="`Clone section ${i + 1}`" @click="emit('clone-section', i)"><OpIcon name="copy" :size="13" /></button>
            <button type="button" class="text-ink-faint hover:text-down disabled:opacity-30" :disabled="schema.sections.length <= 1" :aria-label="`Delete section ${i + 1}`" @click="emit('delete-section', i)"><OpIcon name="trash" :size="13" /></button>
          </template>
        </div>
        <ul class="mt-1 ml-3 space-y-0.5 border-l border-line-soft pl-2">
          <li v-for="(f, j) in sec.fields" :key="f.id">
            <button
              type="button"
              :class="['flex w-full items-center justify-between gap-2 rounded-control px-2 py-1 text-left text-small', isField(i, j) || (sel.s === i && sel.f === j) ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:bg-white/4 hover:text-ink']"
              @click="emit('select', { s: i, f: j })"
            >
              <span class="min-w-0 truncate">{{ f.label }}</span>
              <span class="shrink-0 font-mono text-label text-ink-faint">{{ typeLabel(f.type) }}</span>
            </button>
          </li>
          <li v-if="!sec.fields.length" class="px-2 py-1 text-small text-ink-faint">No fields yet</li>
        </ul>
      </li>
    </ul>
    <OpButton v-if="!readonly" class="mt-3" size="sm" variant="secondary" icon="plus" @click="emit('add-section')">Add section</OpButton>
  </nav>
</template>
