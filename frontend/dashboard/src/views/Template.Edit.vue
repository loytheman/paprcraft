<script setup>
// /templates/:id, the editor for one of the account's templates (read-only for viewers).
import { useRoute } from 'vue-router';
import TemplateEditor from '@/components/template/TemplateEditor.vue';

const route = useRoute();
</script>

<template>
  <TemplateEditor :id="String(route.params.id)" mode="account" />
</template>
