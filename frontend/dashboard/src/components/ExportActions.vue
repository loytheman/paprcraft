<script setup>
// The buttons of one generated document (an exportHistory entry): preview, download the Word file,
// download the PDF, and the PDF's own state while it is being made. Used by the template export
// panel and the submission's Documents card.
import { computed } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';

const props = defineProps({ entry: { type: Object, required: true } });
const emit = defineEmits(['preview']);
const hasPdf = computed(() => !!props.entry.pdfUrl);
// A PDF is shown by the browser itself; a Word file goes through the Office viewer.
const preview = () => emit('preview', hasPdf.value ? { url: props.entry.pdfViewUrl, pdf: true } : { url: props.entry.url, pdf: false });
const link = 'inline-flex h-8 items-center gap-1.5 rounded-control border border-line-strong px-3 text-small text-ink hover:bg-ink/4';
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <OpButton v-if="entry.url" size="sm" variant="secondary" icon="play" @click="preview">Preview</OpButton>
    <a v-if="entry.url" :href="entry.url" download :class="link"><OpIcon name="download" :size="14" /> Word</a>
    <a v-if="entry.pdfUrl" :href="entry.pdfUrl" download :class="link"><OpIcon name="download" :size="14" /> PDF</a>
    <span v-else-if="entry.url && entry.pdfStatus === 'processing'" class="text-small text-ink-faint">Making the PDF…</span>
    <span v-else-if="entry.pdfStatus === 'failed'" class="text-small text-down">{{ entry.pdfError || 'The PDF could not be made.' }}</span>
    <span v-else-if="entry.processStatus === 'processing'" class="text-small text-ink-faint">Checking again in a few seconds…</span>
  </div>
</template>
