<script setup>
// One Quill editor for one text cell (a paragraph, a list item, a table cell). v-model is the
// cell: { text (html), delta }. Both are rewritten on every edit, because the docx renderer reads
// the delta and the editor reloads from the html. The editor registers with the editor context so
// the toolbar can act on whichever one has the caret.
import { inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import 'quill/dist/quill.core.css';
import '@/helpers/template/quill.css';
import { Quill, EDITOR_FORMATS, editorDelta, editorHtml, htmlToDelta } from '@/helpers/template/quill';
import { TPL_KEY } from '@/helpers/template/context';

const props = defineProps({
  modelValue: { type: Object, required: true },
  editorId: { type: String, required: true },
  blockId: { type: String, required: true },
  placeholder: { type: String, default: 'Type something...' },
});

const ctx = inject(TPL_KEY, null);
const el = ref(null);
let quill = null;

const onText = (delta, oldDelta, source) => {
  if (source === 'silent' || !quill) return;
  props.modelValue.delta = editorDelta(quill);
  props.modelValue.text = editorHtml(quill);
};
const onSelection = (range) => {
  if (range && quill) ctx?.onSelection(quill, range, props.blockId);
};

onMounted(() => {
  quill = new Quill(el.value, {
    formats: EDITOR_FORMATS,
    modules: { toolbar: false, history: { maxStack: 0, userOnly: true } },
    placeholder: props.placeholder,
    readOnly: !!ctx?.readonly,
  });
  if (props.modelValue.text) quill.setContents(htmlToDelta(quill, props.modelValue.text), 'silent');
  quill.on('text-change', onText);
  quill.on('selection-change', onSelection);
  ctx?.registerEditor(props.editorId, props.blockId, quill);
});

onBeforeUnmount(() => {
  quill?.off('text-change', onText);
  quill?.off('selection-change', onSelection);
  ctx?.unregisterEditor(props.editorId, quill);
  quill = null;
});

watch(() => ctx?.readonly, (ro) => quill?.enable(!ro));
</script>

<template>
  <div ref="el" class="tpl-quill" />
</template>
