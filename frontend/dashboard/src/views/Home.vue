<script setup>
// Placeholder landing page of the signed-in app. Replace with your product's main screen.
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import { session } from '@/session';

const name = computed(() => session.user?.firstName || session.user?.email || '');
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <p class="eyebrow">Home</p>
    <h1 class="mt-2 text-h2 text-ink">Welcome to paprcraft, {{ name }}</h1>
    <p class="mt-2 text-body text-ink-muted">This is the starter dashboard. Sign-in, teams, labels, document templates, activity and API keys are wired up; add your own pages in <span class="font-mono">src/views</span> and routes in <span class="font-mono">src/router.js</span>.</p>
    <div class="mt-6 flex flex-wrap gap-3">
      <RouterLink :to="{ name: 'templates' }"><OpButton>Templates</OpButton></RouterLink>
      <RouterLink :to="{ name: 'labels' }"><OpButton variant="secondary">Labels</OpButton></RouterLink>
      <RouterLink :to="{ name: 'team' }"><OpButton variant="secondary">Team</OpButton></RouterLink>
      <RouterLink :to="{ name: 'activity' }"><OpButton variant="secondary">Activity</OpButton></RouterLink>
    </div>
  </div>
</template>
