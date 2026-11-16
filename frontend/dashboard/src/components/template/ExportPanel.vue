<script setup>
// Generate a .docx from the template and list the exports. The API starts the export and the
// docx Lambda finishes it, so entries show "processing" until it is done; this panel polls every
// 4 seconds while any entry is still processing.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { formatDateTime } from '@/helpers/Format';
import * as TemplateService from '@/services/service.template';
import { askConfirm } from '@/helpers/Confirm';

const props = defineProps({
  open: { type: Boolean, default: false },
  templateId: { type: String, required: true },
  templateName: { type: String, default: '' },
  history: { type: Array, default: () => [] },
  dirty: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  // () => Promise: saves the template (rejects if it can't); () => values the export should use
  save: { type: Function, required: true },
  values: { type: Function, required: true },
});
const emit = defineEmits(['close', 'history']);

const busy = ref(false);
const error = ref('');
const processing = computed(() => props.history.some((h) => h.processStatus === 'processing'));
const entries = computed(() => props.history.slice().reverse());

const refresh = async () => {
  try {
    const t = await TemplateService.getTemplate(props.templateId);
    emit('history', t.exportHistory ?? []);
  } catch (e) {
    error.value = e.message || 'Could not refresh the exports.';
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
  if (props.dirty) {
    const ok = await askConfirm({
      title: 'Save before generating?',
      message: 'The document is made from the saved template. Your unsaved changes will be saved first.',
      confirmLabel: 'Save and generate',
      icon: 'send',
      tone: 'primary',
    });
    if (!ok) return;
  }
  busy.value = true;
  try {
    if (props.dirty) await props.save();
    const t = await TemplateService.generateDocument(props.templateId, props.values());
    emit('history', t.exportHistory ?? []);
  } catch (e) {
    error.value = e.fieldErrors?.[0]?.message || e.message || 'Could not start the export.';
  }
  busy.value = false;
};

const remove = async (h) => {
  const ok = await askConfirm({ title: 'Delete this export?', message: 'The file is deleted too.', confirmLabel: 'Delete' });
  if (!ok) return;
  try {
    const t = await TemplateService.deleteExport(props.templateId, h.cbId);
    emit('history', t.exportHistory ?? []);
  } catch (e) {
    error.value = e.message || 'Could not delete the export.';
  }
};

const STATUS = { processing: 'Processing…', completed: 'Ready', failed: 'Failed' };
</script>

<template>
  <aside v-if="open" class="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-line bg-surface-2 shadow-rim" aria-label="Generate document">
    <div class="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
      <div>
        <h2 class="text-h3 text-ink">Generate document</h2>
        <p class="text-small text-ink-faint">{{ templateName }}</p>
      </div>
      <div class="flex items-center gap-1">
        <OpButton size="sm" variant="ghost" aria-label="Refresh" @click="refresh"><OpIcon name="refresh" :size="14" /></OpButton>
        <OpButton size="sm" variant="ghost" aria-label="Close" @click="emit('close')"><OpIcon name="x" :size="14" /></OpButton>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4">
      <OpButton v-if="!readonly" icon="send" block :disabled="busy" @click="generate">{{ busy ? 'Starting…' : 'Generate .docx' }}</OpButton>
      <p class="mt-2 text-small text-ink-faint">Uses the placeholder values shown in the editor. Word files appear below when they are ready.</p>
      <p v-if="error" role="alert" class="status-down mt-3 rounded-control border px-3 py-2 text-small">{{ error }}</p>

      <p v-if="!entries.length" class="mt-6 text-body text-ink-muted">No exports yet.</p>
      <ul class="mt-4 space-y-3">
        <li v-for="h in entries" :key="h.cbId" class="rounded-card border border-line bg-surface-1 p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-body" :class="{ 'text-ink': h.processStatus === 'completed', 'text-ink-muted': h.processStatus === 'processing', 'text-down': h.processStatus === 'failed' }">{{ STATUS[h.processStatus] ?? h.processStatus }}</span>
            <span class="text-small text-ink-faint">{{ formatDateTime(h.createdAt) }}</span>
          </div>
          <p v-if="h.createdBy" class="mt-0.5 text-small text-ink-faint">{{ h.createdBy.name || h.createdBy.email }}</p>
          <p v-if="h.error" class="mt-1 text-small text-down">{{ h.error }}</p>
          <div class="mt-2 flex items-center gap-2">
            <a v-if="h.url" :href="h.url" download class="inline-flex h-8 items-center gap-1.5 rounded-control border border-line-strong px-3 text-small text-ink hover:bg-white/4"><OpIcon name="download" :size="14" /> Download</a>
            <span v-else-if="h.processStatus === 'processing'" class="text-small text-ink-faint">Checking again in a few seconds…</span>
            <OpButton v-if="!readonly" size="sm" variant="ghost" aria-label="Delete export" class="ml-auto" @click="remove(h)"><OpIcon name="trash" :size="14" /></OpButton>
          </div>
        </li>
      </ul>
    </div>
  </aside>
</template>
