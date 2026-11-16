<script setup>
// "Documents": render this submission into a .docx with the form's template, and list the exports.
// The API starts the export and the docx Lambda finishes it; while any entry is processing this
// card re-reads the submission every 4 seconds.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import * as SubmissionService from '@/services/service.submission';
import { generateBlock } from '@/helpers/forms/submission';
import { formatDateTime } from '@/helpers/Format';

const props = defineProps({
  submission: { type: Object, required: true },
  form: { type: Object, default: null },
  role: { type: String, default: 'owner' },
  dirty: { type: Boolean, default: false }, // unsaved answers: the document is made from the saved ones
  flush: { type: Function, default: null }, // () => Promise: saves pending answers first
});
const emit = defineEmits(['history']);
const router = useRouter();

const busy = ref(false);
const error = ref('');
const entries = computed(() => (props.submission.exportHistory ?? []).slice().reverse());
const processing = computed(() => entries.value.some((h) => h.processStatus === 'processing'));
const blocked = computed(() => generateBlock(props.submission, props.form, props.role));
const noTemplate = computed(() => props.form && !props.form.templateId);
const builderLink = computed(() => (props.form && router.hasRoute('form') ? { name: 'form', params: { id: props.form.id } } : null));

const refresh = async () => {
  try {
    const s = await SubmissionService.getSubmission(props.submission.id);
    emit('history', s.exportHistory ?? []);
  } catch (e) {
    error.value = e.message || 'Could not refresh the documents.';
  }
};

let timer = null;
const stop = () => { clearInterval(timer); timer = null; };
watch(processing, (p) => {
  stop();
  if (p) timer = setInterval(refresh, 4000);
}, { immediate: true });
onBeforeUnmount(stop);

const generate = async () => {
  error.value = '';
  busy.value = true;
  try {
    if (props.flush) await props.flush(); // the document is made from the saved answers
    const s = await SubmissionService.generateDocument(props.submission.id);
    emit('history', s.exportHistory ?? []);
  } catch (e) {
    error.value = e.fieldErrors?.[0]?.message || e.message || 'Could not start the document.';
  }
  busy.value = false;
};

const STATUS = { processing: 'Processing…', completed: 'Ready', failed: 'Failed' };
</script>

<template>
  <section class="rounded-sheet border border-line bg-surface-2 p-5" aria-label="Documents">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-h3 text-ink">Documents</h2>
      <OpButton v-if="role !== 'viewer'" size="sm" variant="ghost" aria-label="Refresh documents" @click="refresh"><OpIcon name="refresh" :size="14" /></OpButton>
    </div>
    <p class="mt-1 text-body text-ink-muted">Fill the form's document template with these answers and download it as a Word file.</p>

    <p v-if="noTemplate" class="status-warn mt-3 rounded-control border px-3 py-2 text-small">
      This form has no document template yet.
      <RouterLink v-if="builderLink" :to="builderLink" class="underline">Choose one in the form builder.</RouterLink>
    </p>
    <p v-else-if="blocked" class="mt-3 text-small text-ink-faint">{{ blocked }}</p>

    <div class="mt-4">
      <OpButton v-if="role !== 'viewer'" icon="send" :disabled="busy || !!blocked" @click="generate">{{ busy ? 'Starting…' : 'Generate document' }}</OpButton>
      <p v-if="dirty && !blocked" class="mt-2 text-small text-ink-faint">Your latest answers are saved first.</p>
    </div>
    <p v-if="error" role="alert" class="status-down mt-3 rounded-control border px-3 py-2 text-small">{{ error }}</p>

    <p v-if="!entries.length" class="mt-4 text-small text-ink-faint">No documents yet.</p>
    <ul v-else class="mt-4 space-y-2">
      <li v-for="h in entries" :key="h.cbId" class="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface-1 px-3 py-2">
        <div class="min-w-0">
          <span class="text-body" :class="{ 'text-ink': h.processStatus === 'completed', 'text-ink-muted': h.processStatus === 'processing', 'text-down': h.processStatus === 'failed' }">{{ STATUS[h.processStatus] ?? h.processStatus }}</span>
          <span class="ml-2 text-small text-ink-faint">{{ formatDateTime(h.createdAt) }}<template v-if="h.createdBy"> · {{ h.createdBy.name || h.createdBy.email }}</template></span>
          <p v-if="h.error" class="text-small text-down">{{ h.error }}</p>
        </div>
        <a v-if="h.url" :href="h.url" download class="inline-flex h-8 items-center gap-1.5 rounded-control border border-line-strong px-3 text-small text-ink hover:bg-white/4"><OpIcon name="download" :size="14" /> Download</a>
        <span v-else-if="h.processStatus === 'processing'" class="text-small text-ink-faint">Checking again in a few seconds…</span>
      </li>
    </ul>
  </section>
</template>
