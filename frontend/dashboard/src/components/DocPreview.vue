<script setup>
// Read-only preview of a generated .docx. Word files can't be shown by the browser, so this embeds
// Microsoft's Office viewer, which fetches the file itself from the signed download link (valid for
// a short time). That means the viewer's servers receive the document; the Download button is the
// way to keep it in-house.
import { computed } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';

const props = defineProps({
  url: { type: String, default: '' },
  title: { type: String, default: 'Preview' },
  downloadUrl: { type: String, default: '' }, // when `url` is an inline link, the one that downloads
  pdf: { type: Boolean, default: false }, // the link is a PDF: the browser shows it directly, no Office viewer
});
const emit = defineEmits(['close']);
const src = computed(() => (!props.url ? '' : props.pdf ? props.url : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(props.url)}`));
</script>

<template>
  <Teleport to="body">
    <div v-if="url" class="fixed inset-0 z-50 flex flex-col bg-ink/40 p-3 md:p-8" role="dialog" aria-modal="true" :aria-label="title" @keydown.esc="emit('close')">
      <div class="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-sheet border border-line bg-surface-1 shadow-modal">
        <div class="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
          <div class="min-w-0">
            <h2 class="truncate text-h3 text-ink">{{ title }}</h2>
            <p class="text-small text-ink-faint">{{ pdf ? 'The PDF, shown by your browser.' : "Shown by Microsoft's Office viewer. It can take a few seconds to load." }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <a :href="downloadUrl || url" download class="inline-flex h-8 items-center gap-1.5 rounded-control border border-line-strong px-3 text-small text-ink hover:bg-ink/4"><OpIcon name="download" :size="14" /> Download</a>
            <OpButton size="sm" variant="ghost" aria-label="Close preview" @click="emit('close')"><OpIcon name="x" :size="14" /></OpButton>
          </div>
        </div>
        <iframe :src="src" class="min-h-0 w-full flex-1 bg-sunken" title="Document preview" frameborder="0"></iframe>
      </div>
    </div>
  </Teleport>
</template>
