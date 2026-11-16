<script setup>
// A new API key, shown once (after regenerating it), with a
// copy button. The API only keeps a hash, so this is the only time it can be read.
import { ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpStatusBadge from '@ds/components/OpStatusBadge.vue';

const props = defineProps({ token: { type: String, required: true } });
const copied = ref('');
const copy = async (what, text) => {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = what;
    setTimeout(() => { if (copied.value === what) copied.value = ''; }, 1500);
  } catch {
    // clipboard blocked: the key is on screen to select by hand
  }
};
</script>

<template>
  <section class="rounded-sheet border border-warn/40 bg-surface-2 p-5" aria-labelledby="key-heading">
    <div class="flex flex-wrap items-center gap-3">
      <h2 id="key-heading" class="text-h3 text-ink">Your API key</h2>
      <OpStatusBadge status="warn">Shown once</OpStatusBadge>
    </div>
    <p class="mt-2 text-body text-ink-muted">Copy it now. It can't be shown again, but you can make a new key. Keep it out of browsers and public repositories.</p>
    <div class="mt-4 flex items-center gap-3 rounded-control border border-line bg-sunken py-2 pr-2 pl-3">
      <code class="min-w-0 flex-1 font-mono text-small leading-5 break-all text-ink select-all">{{ props.token }}</code>
      <OpButton class="shrink-0" variant="secondary" size="sm" :icon="copied === 'key' ? 'check' : 'copy'" @click="copy('key', props.token)">{{ copied === 'key' ? 'Copied' : 'Copy' }}</OpButton>
    </div>
  </section>
</template>
