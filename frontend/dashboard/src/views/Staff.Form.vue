<script setup>
// /staff/forms/:id, the builder for a master form (staff only).
import { useRoute } from 'vue-router';
import FormBuilder from '@/components/forms/FormBuilder.vue';

const route = useRoute();
</script>

<template>
  <FormBuilder :id="String(route.params.id)" mode="master" />
</template>
