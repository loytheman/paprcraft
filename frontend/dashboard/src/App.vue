<script setup>
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import OpConfirmDialog from '@ds/components/OpConfirmDialog.vue';
import OpLogo from '@ds/components/OpLogo.vue';
import { answerConfirm, confirmState } from '@/helpers/Confirm';
import { session } from '@/session';

// Leaving the page (the browser's back button) cancels a question about what was on it.
const route = useRoute();
watch(() => route.fullPath, () => answerConfirm(false));
</script>

<template>
  <!-- The router holds the first page until the session resumes, which can take a cold API start. -->
  <div v-if="!session.checked" role="status" aria-label="Loading" class="flex min-h-dvh items-center justify-center">
    <OpLogo class="animate-pulse motion-reduce:animate-none" />
  </div>
  <RouterView v-else />
  <OpConfirmDialog
    :open="confirmState.open"
    :title="confirmState.title"
    :message="confirmState.message"
    :confirm-label="confirmState.confirmLabel"
    :cancel-label="confirmState.cancelLabel"
    :icon="confirmState.icon"
    :tone="confirmState.tone"
    @confirm="answerConfirm(true)"
    @cancel="answerConfirm(false)"
  />
</template>
