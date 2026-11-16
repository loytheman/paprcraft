<script setup>
// The decision on a submitted form: approve (comment optional) or reject (a reason is needed), the
// recorded decision, and reopen. Every action resolves with the updated submission.
import { computed, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpTextarea from '@ds/components/OpTextarea.vue';
import * as SubmissionService from '@/services/service.submission';
import { askConfirm } from '@/helpers/Confirm';
import { actorName, statusMeta } from '@/helpers/forms/submission';
import { formatDateTime } from '@/helpers/Format';

const props = defineProps({
  submission: { type: Object, required: true },
  can: { type: Object, required: true }, // actionsFor(status, role)
});
const emit = defineEmits(['updated']);

const comment = ref('');
const busy = ref('');
const error = ref('');

const decided = computed(() => ['approved', 'rejected'].includes(props.submission.status));
const meta = computed(() => statusMeta(props.submission.status));

const run = async (name, fn) => {
  busy.value = name;
  error.value = '';
  try {
    emit('updated', await fn());
    comment.value = '';
  } catch (e) {
    error.value = e.fieldErrors?.[0]?.message || e.message || 'That did not work. Try again.';
  }
  busy.value = '';
};

const approve = () => run('approve', () => SubmissionService.approveSubmission(props.submission.id, comment.value.trim()));
const reject = () => {
  if (comment.value.trim().length < 3) { error.value = 'Say why it is rejected (at least 3 characters).'; return; }
  return run('reject', () => SubmissionService.rejectSubmission(props.submission.id, comment.value.trim()));
};
const reopen = async () => {
  const ok = await askConfirm({ title: 'Reopen this submission?', message: 'It goes back to a draft so the answers can be changed. The earlier decision is cleared (it stays in the activity history).', confirmLabel: 'Reopen', icon: 'refresh', tone: 'primary' });
  if (ok) await run('reopen', () => SubmissionService.reopenSubmission(props.submission.id));
};
</script>

<template>
  <section class="rounded-sheet border border-line bg-surface-2 p-5" aria-label="Review">
    <h2 class="text-h3 text-ink">Review</h2>

    <template v-if="submission.status === 'draft'">
      <p class="mt-1 text-body text-ink-muted">{{ meta.hint }} Submit it when the answers are complete; a reviewer can then approve or reject it.</p>
    </template>

    <template v-else>
      <p class="mt-1 text-small text-ink-faint">
        Submitted<template v-if="submission.submittedAt"> {{ formatDateTime(submission.submittedAt) }}</template>
        <template v-if="actorName(submission.submittedBy)"> by {{ actorName(submission.submittedBy) }}</template>.
      </p>

      <div v-if="decided" class="mt-3 rounded-control border px-3 py-2 text-body" :class="submission.status === 'approved' ? 'status-ok' : 'status-down'">
        <p class="font-medium">{{ meta.label }}<template v-if="submission.decidedAt"> {{ formatDateTime(submission.decidedAt) }}</template><template v-if="actorName(submission.decidedBy)"> by {{ actorName(submission.decidedBy) }}</template></p>
        <p v-if="submission.decisionComment" class="mt-1 whitespace-pre-wrap text-small">{{ submission.decisionComment }}</p>
      </div>

      <div v-if="submission.status === 'submitted' && (can.approve || can.reject)" class="mt-4">
        <OpTextarea v-model="comment" label="Comment" :rows="2" placeholder="Required when rejecting, optional when approving" :maxlength="2000" />
        <div class="mt-3 flex flex-wrap gap-2">
          <OpButton v-if="can.approve" icon="check" :disabled="!!busy" @click="approve">{{ busy === 'approve' ? 'Approving…' : 'Approve' }}</OpButton>
          <OpButton v-if="can.reject" variant="destructive" icon="x" :disabled="!!busy" @click="reject">{{ busy === 'reject' ? 'Rejecting…' : 'Reject' }}</OpButton>
        </div>
      </div>
      <p v-else-if="submission.status === 'submitted'" class="mt-3 text-body text-ink-muted">Waiting for a decision.</p>

      <div v-if="can.reopen" class="mt-4">
        <OpButton variant="secondary" size="sm" icon="refresh" :disabled="!!busy" @click="reopen">Reopen to edit</OpButton>
      </div>
    </template>

    <p v-if="error" role="alert" class="status-down mt-3 rounded-control border px-3 py-2 text-small">{{ error }}</p>
  </section>
</template>
