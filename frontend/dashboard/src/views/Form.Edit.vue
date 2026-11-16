<script setup>
// /forms/:id, the builder for one of the account's forms (read-only for viewers).
import { useRoute } from 'vue-router';
import FormBuilder from '@/components/forms/FormBuilder.vue';

const route = useRoute();
</script>

<template>
  <FormBuilder :id="String(route.params.id)" mode="account" />
</template>
