<script setup>
// What was stamped when a customer signed through their link: name, time, where from, and the
// exact wording they agreed to. A typed name is an acknowledgement, not a qualified e-signature.
import { formatDateTime } from '@/helpers/Format';

defineProps({ signature: { type: Object, required: true } });
</script>

<template>
  <section class="rounded-sheet border border-line bg-surface-2 p-5" aria-label="Signature">
    <h2 class="text-h3 text-ink">Customer signature</h2>
    <dl class="mt-3 grid gap-x-6 gap-y-2 text-body sm:grid-cols-[8rem_1fr]">
      <dt class="text-ink-faint">Signed by</dt><dd class="text-ink">{{ signature.name || '—' }}</dd>
      <dt class="text-ink-faint">Signed at</dt><dd class="text-ink">{{ formatDateTime(signature.at) }}</dd>
      <dt class="text-ink-faint">From IP</dt><dd class="font-mono text-small text-ink">{{ signature.ip || '—' }}</dd>
      <dt v-if="signature.consentText" class="text-ink-faint">They agreed to</dt><dd v-if="signature.consentText" class="text-ink-muted">{{ signature.consentText }}</dd>
    </dl>
    <p class="mt-3 text-small text-ink-faint">A typed name with a timestamp is an acknowledgement, not a qualified electronic signature.</p>
  </section>
</template>
