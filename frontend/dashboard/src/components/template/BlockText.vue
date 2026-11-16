<script setup>
// A paragraph or list item: one Quill editor over block.item ({ text, delta }).
import TemplateQuill from './TemplateQuill.vue';

defineProps({ block: { type: Object, required: true } });
</script>

<template>
  <TemplateQuill :model-value="block.item" :editor-id="block.id" :block-id="block.id" class="w-full" />
</template>
