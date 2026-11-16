<script setup>
// The account's API key (owner only): see whether there is one, make a new one (shown once), or
// revoke it. Use it as `Authorization: Bearer pck_...` on routes behind apiKeyAuth() in the API.
import { onMounted, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import ApiKeyReveal from '@/components/ApiKeyReveal.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import * as ApiKeyService from '@/services/service.apiKey';
import { askConfirm } from '@/helpers/Confirm';

const info = ref(null);
const token = ref('');
const error = ref('');
const busy = ref(false);

const load = async () => {
  try {
    info.value = await ApiKeyService.getKey();
  } catch (e) {
    error.value = e.message || 'Could not load your API key.';
  }
};
onMounted(load);

const regenerate = async () => {
  if (info.value?.exists && !(await askConfirm({ title: 'Make a new key?', message: 'The current key stops working straight away.', confirmLabel: 'Make new key' }))) return;
  busy.value = true;
  error.value = '';
  try {
    token.value = (await ApiKeyService.regenerate()).token;
    await load();
  } catch (e) {
    error.value = e.message || 'Could not make a key.';
  }
  busy.value = false;
};
const revoke = async () => {
  if (!(await askConfirm({ title: 'Revoke the API key?', message: 'Anything using it stops working.', confirmLabel: 'Revoke key' }))) return;
  busy.value = true;
  try {
    await ApiKeyService.revoke();
    token.value = '';
    await load();
  } catch (e) {
    error.value = e.message || 'Could not revoke the key.';
  }
  busy.value = false;
};
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <p class="eyebrow">Settings</p>
    <h1 class="mt-2 text-h2 text-ink">API key</h1>
    <p class="mt-2 text-body text-ink-muted">One key per account. Keep it on your server, never in a browser or app.</p>

    <p v-if="error" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ error }}</p>
    <PageSkeleton v-if="!info && !error" kind="list" class="mt-6" />
    <template v-else-if="info">
      <ApiKeyReveal v-if="token" class="mt-6" :token="token" />
      <section class="mt-6 rounded-sheet border border-line bg-surface-2 p-5">
        <p class="text-body text-ink-muted">
          <template v-if="info.exists">A key starting <span class="font-mono text-ink">pck_…{{ info.prefix }}…</span> is active.</template>
          <template v-else>No key yet.</template>
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <OpButton size="sm" :disabled="busy" @click="regenerate">{{ info.exists ? 'Make a new key' : 'Make a key' }}</OpButton>
          <OpButton v-if="info.exists" size="sm" variant="destructive" :disabled="busy" @click="revoke">Revoke</OpButton>
        </div>
      </section>
    </template>
  </div>
</template>
