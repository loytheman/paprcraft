<script setup>
// The sections of a template: select, rename, clone, delete, add, reorder (drag, or the arrows).
import { ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import TplDialog from './TplDialog.vue';
import { countPlaceholders } from '@/helpers/template/blocks';

const props = defineProps({
  open: { type: Boolean, default: false },
  sections: { type: Array, required: true },
  current: { type: Number, default: 0 },
  placeholders: { type: Object, default: () => ({}) },
  readonly: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'select', 'add', 'clone', 'delete', 'move']);

const dragFrom = ref(-1);
const counts = (s) => countPlaceholders(s.list, props.placeholders);
const onDrop = (to) => {
  if (dragFrom.value >= 0 && dragFrom.value !== to) emit('move', dragFrom.value, to);
  dragFrom.value = -1;
};
</script>

<template>
  <TplDialog :open="open" title="Sections" wide @close="emit('close')">
    <ul class="space-y-2">
      <li
        v-for="(s, i) in sections"
        :key="i"
        class="flex flex-wrap items-center gap-2 rounded-card border bg-surface-2 px-3 py-2"
        :class="i === current ? 'border-cyan/60' : 'border-line'"
        @dragover.prevent
        @drop.prevent="onDrop(i)"
      >
        <span v-if="!readonly" class="cursor-grab text-ink-faint hover:text-ink" draggable="true" title="Drag to reorder" @dragstart="dragFrom = i"><OpIcon name="menu" :size="14" /></span>
        <span class="w-6 text-small text-ink-faint">{{ i + 1 }}.</span>
        <input
          v-model="s.name"
          :readonly="readonly"
          class="min-w-0 flex-1 rounded-control border border-transparent bg-transparent px-2 py-1 text-body text-ink hover:border-line focus:border-cyan focus:outline-none"
          :aria-label="`Name of section ${i + 1}`"
        />
        <span class="font-mono text-label text-ink-faint">{{ counts(s).replaced }}/{{ counts(s).total }} placeholders</span>
        <OpButton size="sm" :variant="i === current ? 'primary' : 'secondary'" @click="emit('select', i)">{{ i === current ? 'Open' : 'Go to' }}</OpButton>
        <template v-if="!readonly">
          <OpButton size="sm" variant="ghost" :disabled="i === 0" aria-label="Move up" @click="emit('move', i, i - 1)"><OpIcon name="arrow-left" :size="14" class="rotate-90" /></OpButton>
          <OpButton size="sm" variant="ghost" :disabled="i === sections.length - 1" aria-label="Move down" @click="emit('move', i, i + 1)"><OpIcon name="arrow-left" :size="14" class="-rotate-90" /></OpButton>
          <OpButton size="sm" variant="ghost" aria-label="Clone section" @click="emit('clone', i)"><OpIcon name="copy" :size="14" /></OpButton>
          <OpButton size="sm" variant="ghost" :disabled="sections.length <= 1" aria-label="Delete section" @click="emit('delete', i)"><OpIcon name="trash" :size="14" /></OpButton>
        </template>
      </li>
    </ul>
    <template #footer>
      <OpButton v-if="!readonly" variant="secondary" icon="plus" @click="emit('add')">Add section</OpButton>
      <OpButton @click="emit('close')">Done</OpButton>
    </template>
  </TplDialog>
</template>
