<script setup>
// Every file attached to the submission, with a download link (the API returns a short-lived URL).
// Shown for a submitted form, where the renderer is read-only; while drafting, the file fields
// themselves list and upload files.
import { computed } from 'vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { fileSize } from '@/helpers/forms/submission';
import { allFields } from '@ds/lib/forms.js';

const props = defineProps({ submission: { type: Object, required: true } });
const labels = computed(() => Object.fromEntries(allFields(props.submission.schema).map((f) => [f.key, f.label])));
const files = computed(() => props.submission.attachments ?? []);
</script>

<template>
  <section v-if="files.length" class="rounded-sheet border border-line bg-surface-2 p-5" aria-label="Files">
    <h2 class="text-h3 text-ink">Files</h2>
    <ul class="mt-3 divide-y divide-line-faint rounded-control border border-line">
      <li v-for="f in files" :key="f.id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div class="min-w-0">
          <p class="truncate text-body text-ink">{{ f.name }}</p>
          <p class="text-small text-ink-faint">{{ labels[f.fieldKey] || f.fieldKey }}<template v-if="fileSize(f.size)"> · {{ fileSize(f.size) }}</template></p>
        </div>
        <a v-if="f.url" :href="f.url" target="_blank" rel="noopener" class="inline-flex h-8 items-center gap-1.5 rounded-control border border-line-strong px-3 text-small text-ink hover:bg-ink/4"><OpIcon name="download" :size="14" /> Open</a>
      </li>
    </ul>
  </section>
</template>
