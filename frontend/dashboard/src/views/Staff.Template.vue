<script setup>
// /staff/templates/:id, the editor for a master template (staff only).
import { useRoute } from 'vue-router';
import TemplateEditor from '@/components/template/TemplateEditor.vue';

const route = useRoute();
</script>

<template>
  <TemplateEditor :id="String(route.params.id)" mode="master" />
</template>
