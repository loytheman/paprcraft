<script setup>
// Word to PDF: drop a .docx, get a PDF. The browser uploads straight to storage with a short-lived
// link, the API starts the converter, and this page polls until the PDF is ready. Files are deleted
// automatically after a day.
import { computed, onBeforeUnmount, ref } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import DocPreview from '@/components/DocPreview.vue';
import * as ConverterService from '@/services/service.converter';

const MAX_MB = 10;
const state = ref('idle'); // idle | uploading | converting | done | failed
const file = ref(null);
const result = ref(null);
const error = ref('');
const over = ref(false);
const preview = ref(false);
const input = ref(null);
const slow = ref(false);

let timer = null;
let slowTimer = null;
const stop = () => { clearTimeout(timer); clearTimeout(slowTimer); timer = null; slowTimer = null; };
onBeforeUnmount(stop);

const reset = () => { stop(); state.value = 'idle'; file.value = null; result.value = null; error.value = ''; slow.value = false; if (input.value) input.value.value = ''; };
const fail = (msg) => { stop(); state.value = 'failed'; error.value = msg; };

const poll = (id, name, startedAt) => {
  timer = setTimeout(async () => {
    try {
      const s = await ConverterService.conversionStatus(id, name);
      if (s.status === 'completed') { stop(); result.value = s; state.value = 'done'; return; }
      if (s.status === 'failed') return fail(s.error);
      if (Date.now() - startedAt > 180000) return fail('The conversion is taking too long. Try again in a moment.');
    } catch (e) {
      return fail(e.message || 'Could not check the conversion.');
    }
    poll(id, name, startedAt);
  }, 2000);
};

const convert = async (f) => {
  error.value = '';
  if (!f) return;
  if (!/\.docx$/i.test(f.name)) return fail('Choose a Word document (.docx). Older .doc files need to be saved as .docx first.');
  if (f.size > MAX_MB * 1024 * 1024) return fail(`Files can be up to ${MAX_MB} MB.`);
  file.value = f;
  state.value = 'uploading';
  try {
    const up = await ConverterService.createUpload(f.name, f.size);
    const put = await fetch(up.uploadUrl, { method: 'PUT', headers: { 'Content-Type': up.contentType }, body: f });
    if (!put.ok) throw new Error('The upload failed. Try again.');
    await ConverterService.startConversion(up.id);
    state.value = 'converting';
    slowTimer = setTimeout(() => { slow.value = true; }, 8000); // the first conversion after a quiet spell is slower
    poll(up.id, f.name, Date.now());
  } catch (e) {
    fail(e.fieldErrors?.[0]?.message || e.message || 'Could not convert this file.');
  }
};

const onPick = (e) => convert(e.target.files?.[0]);
const onDrop = (e) => { over.value = false; convert(e.dataTransfer?.files?.[0]); };
const size = computed(() => (file.value ? `${(file.value.size / 1024 / 1024).toFixed(file.value.size > 1024 * 1024 ? 1 : 2)} MB` : ''));
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <p class="eyebrow">Tools</p>
    <h1 class="mt-2 text-h2 text-ink">Word to PDF</h1>
    <p class="mt-2 text-body text-ink-muted">Upload a Word document and get a PDF. Files are deleted automatically after a day.</p>

    <section class="mt-6">
      <div
        v-if="state === 'idle' || state === 'failed'"
        class="rounded-sheet border-2 border-dashed bg-surface-1 px-6 py-12 text-center transition-colors"
        :class="over ? 'border-primary bg-primary-soft' : 'border-line'"
        @dragover.prevent="over = true"
        @dragleave="over = false"
        @drop.prevent="onDrop"
      >
        <span class="mx-auto flex size-12 items-center justify-center rounded-card bg-primary-soft text-primary-text"><OpIcon name="download" :size="22" class="rotate-180" /></span>
        <p class="mt-4 text-h3 text-ink">Drop a .docx file here</p>
        <p class="mt-1 text-small text-ink-faint">or choose one from your computer. Up to {{ MAX_MB }} MB.</p>
        <div class="mt-5"><OpButton @click="input.click()">Choose a file</OpButton></div>
        <input ref="input" type="file" class="hidden" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="onPick" />
        <p v-if="error" role="alert" class="status-down mx-auto mt-5 max-w-md rounded-control border px-3 py-2 text-small">{{ error }}</p>
      </div>

      <div v-else-if="state === 'uploading' || state === 'converting'" class="rounded-sheet border border-line bg-surface-1 px-6 py-10 text-center" role="status">
        <p class="text-h3 text-ink">{{ state === 'uploading' ? 'Uploading…' : 'Converting to PDF…' }}</p>
        <p class="mt-1 text-small text-ink-faint">{{ file?.name }} · {{ size }}</p>
        <div class="mx-auto mt-5 h-1.5 w-64 overflow-hidden rounded-full bg-sunken"><div class="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none"></div></div>
        <p v-if="slow" class="mt-4 text-small text-ink-faint">Still working. The first conversion after a quiet spell takes up to a minute.</p>
      </div>

      <div v-else class="rounded-sheet border border-line bg-surface-1 px-6 py-8">
        <div class="flex items-center gap-3">
          <span class="flex size-10 items-center justify-center rounded-card bg-primary-soft text-primary-text"><OpIcon name="check" :size="20" /></span>
          <div class="min-w-0">
            <p class="text-h3 text-ink">Your PDF is ready</p>
            <p class="truncate text-small text-ink-faint">{{ result?.fileName }}</p>
          </div>
        </div>
        <div class="mt-6 flex flex-wrap gap-2">
          <a :href="result?.url" download class="inline-flex h-10 items-center gap-2 rounded-control bg-primary px-4 text-body font-medium text-on-primary hover:bg-primary-hover"><OpIcon name="download" :size="16" /> Download PDF</a>
          <OpButton variant="secondary" icon="play" @click="preview = true">Preview</OpButton>
          <OpButton variant="ghost" @click="reset">Convert another</OpButton>
        </div>
      </div>
    </section>

    <p class="mt-6 text-small text-ink-faint">Complex layouts can shift slightly: fonts that aren't installed on the converter are replaced with a similar one.</p>
    <DocPreview :url="preview ? result?.viewUrl : ''" pdf :title="result?.fileName || 'Preview'" @close="preview = false" />
  </div>
</template>
