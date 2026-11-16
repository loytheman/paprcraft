<script setup>
// "Customer link": lets the customer fill a draft themselves. The API returns the URL only once
// (it keeps just a hash), so the dialog shows it with a copy button and it is gone afterwards.
import { computed, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpInput from '@ds/components/OpInput.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import TplDialog from '@/components/template/TplDialog.vue';
import * as SubmissionService from '@/services/service.submission';
import { askConfirm } from '@/helpers/Confirm';
import { linkState } from '@/helpers/forms/submission';

const props = defineProps({
  submission: { type: Object, required: true },
  canShare: { type: Boolean, default: false }, // role allows, and the submission is a draft
  canRevoke: { type: Boolean, default: false }, // role allows
  linksEnabled: { type: Boolean, default: true }, // the form's "customer links" setting
});
const emit = defineEmits(['changed']);

const state = computed(() => linkState(props.submission.link));
const open = ref(false);
const email = ref('');
const days = ref(14);
const busy = ref(false);
const error = ref('');
const result = ref(null); // { url, expiresAt, emailed }
const copied = ref(false);

const show = () => {
  open.value = true;
  result.value = null;
  error.value = '';
  copied.value = false;
};
const close = () => {
  open.value = false;
  result.value = null; // the URL is not kept
  emit('changed');
};

const create = async () => {
  error.value = '';
  const d = Number(days.value);
  if (!Number.isInteger(d) || d < 1 || d > 90) { error.value = 'Choose between 1 and 90 days.'; return; }
  busy.value = true;
  try {
    result.value = await SubmissionService.createLink(props.submission.id, { email: email.value.trim(), expiresInDays: d });
  } catch (e) {
    error.value = e.fieldErrors?.[0]?.message || e.message || 'Could not create the link.';
  }
  busy.value = false;
};

const copy = async () => {
  try {
    await navigator.clipboard.writeText(result.value.url);
    copied.value = true;
  } catch {
    copied.value = false;
    error.value = 'Could not copy. Select the link and copy it by hand.';
  }
};

const revoke = async () => {
  const ok = await askConfirm({ title: 'Revoke the customer link?', message: 'The link stops working straight away. You can make a new one.', confirmLabel: 'Revoke link', icon: 'lock' });
  if (!ok) return;
  try {
    await SubmissionService.revokeLink(props.submission.id);
    emit('changed');
  } catch (e) {
    error.value = e.message || 'Could not revoke the link.';
  }
};
</script>

<template>
  <section class="rounded-sheet border border-line bg-surface-2 p-5" aria-label="Customer link">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-h3 text-ink">Customer link</h2>
      <span class="font-mono text-label uppercase" :class="{ 'text-ok': state.kind === 'active', 'text-ink-faint': state.kind === 'none', 'text-warn': state.kind === 'expired', 'text-cyan': state.kind === 'used' }">{{ state.kind === 'none' ? 'Off' : state.kind }}</span>
    </div>
    <p class="mt-1 text-body text-ink-muted">Send the customer a private link so they can fill in and sign this form themselves. They never see the fields marked for officer use.</p>
    <p class="mt-3 text-small text-ink-faint">{{ state.text }}</p>
    <p v-if="!linksEnabled" class="status-warn mt-3 rounded-control border px-3 py-2 text-small">Customer links are turned off in this form's settings.</p>
    <p v-if="error && !open" role="alert" class="status-down mt-3 rounded-control border px-3 py-2 text-small">{{ error }}</p>
    <div class="mt-4 flex flex-wrap gap-2">
      <OpButton v-if="canShare && linksEnabled" size="sm" icon="send" @click="show">{{ state.kind === 'active' ? 'Make a new link' : 'Share with customer' }}</OpButton>
      <OpButton v-if="canRevoke && state.kind === 'active'" size="sm" variant="secondary" icon="lock" @click="revoke">Revoke</OpButton>
    </div>

    <TplDialog :open="open" title="Share with a customer" @close="close">
      <template v-if="!result">
        <p class="text-body text-ink-muted">Making a new link replaces any earlier one. The customer can fill in the form and sign until the link expires or they submit.</p>
        <div class="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem]">
          <OpInput v-model="email" label="Send it by email (optional)" type="email" placeholder="customer@example.com" hint="Leave empty to copy the link and send it yourself." />
          <OpInput v-model="days" label="Valid for (days)" type="number" min="1" max="90" />
        </div>
        <p v-if="error" role="alert" class="status-down mt-3 rounded-control border px-3 py-2 text-small">{{ error }}</p>
      </template>
      <template v-else>
        <p class="status-ok rounded-control border px-3 py-2 text-small">
          Link created. It expires {{ new Date(result.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }}.
          <template v-if="email.trim()"> {{ result.emailed ? `We emailed it to ${email.trim()}.` : 'The email could not be sent, so copy the link below and send it yourself.' }}</template>
        </p>
        <p class="mt-4 text-small font-medium text-ink-muted">The customer's link</p>
        <div class="mt-1.5 flex items-center gap-2">
          <input :value="result.url" readonly aria-label="Customer link" class="h-10 min-w-0 flex-1 rounded-control border border-line bg-sunken px-3 font-mono text-small text-ink" @focus="$event.target.select()" />
          <OpButton size="sm" variant="secondary" @click="copy"><OpIcon :name="copied ? 'check' : 'copy'" :size="14" /> {{ copied ? 'Copied' : 'Copy' }}</OpButton>
        </div>
        <p class="mt-3 text-small text-ink-faint">This is the only time the link is shown. If you lose it, make a new one.</p>
        <p v-if="error" role="alert" class="status-down mt-3 rounded-control border px-3 py-2 text-small">{{ error }}</p>
      </template>
      <template #footer>
        <template v-if="!result">
          <OpButton variant="ghost" @click="close">Cancel</OpButton>
          <OpButton icon="send" :disabled="busy" @click="create">{{ busy ? 'Creating…' : email.trim() ? 'Create and email' : 'Create link' }}</OpButton>
        </template>
        <OpButton v-else @click="close">Done</OpButton>
      </template>
    </TplDialog>
  </section>
</template>
