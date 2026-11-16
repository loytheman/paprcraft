<script setup>
// The page a customer opens from a form link (/f/<token>): fills the form, which saves as a draft as
// they go, uploads files, signs and submits. No login; see src/api.js for the calls and the ways
// they fail.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import FormRenderer from '@ds/components/FormRenderer.vue';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import env from './Environment.js';
import { FormLinkError, makeApi, tokenFromPath } from './api.js';

const api = makeApi(env.apiUrl);
const token = tokenFromPath(window.location.pathname);

// loading | ready | submitted | invalid | rate | network | error
const state = ref(token ? 'loading' : 'invalid');
const form = ref(null);
const values = ref({});
const attachments = ref([]);
const errors = ref([]);
const renderer = ref(null);

// autosave: idle | saving | saved | error
const savePhase = ref('idle');
const dirty = ref(false);
const submitting = ref(false);
const submitError = ref('');
let loaded = false;
let suppress = false;
let timer = null;
let retryTimer = null;
let saving = null;
let again = false;

const fail = (e) => {
  if (!(e instanceof FormLinkError)) return (state.value = 'error');
  if (e.kind === 'invalid') state.value = 'invalid';
  else if (e.kind === 'rate') state.value = 'rate';
  else if (e.kind === 'network') state.value = 'network';
  else state.value = 'error';
};

const load = async () => {
  state.value = 'loading';
  try {
    const data = await api.getForm(token);
    form.value = data;
    values.value = data.values ?? {};
    attachments.value = data.attachments ?? [];
    document.title = data.title || 'Form';
    state.value = 'ready';
    await nextTick();
    loaded = true;
  } catch (e) {
    fail(e);
  }
};

// Replaces local file entries that were uploaded with the saved ones (which now have ids), keeping
// anything the customer added while the save was running.
const refreshAttachments = async (sent) => {
  const data = await api.getForm(token);
  const added = attachments.value.filter((a) => !sent.includes(a));
  suppress = true;
  attachments.value = [...(data.attachments ?? []), ...added];
  await nextTick();
  suppress = false;
};

// One save at a time; changes made during a save trigger another right after.
const flush = () => {
  clearTimeout(timer);
  if (saving) { again = true; return saving; }
  saving = (async () => {
    do {
      again = false;
      savePhase.value = 'saving';
      const sent = [...attachments.value];
      try {
        const r = await api.saveDraft(token, values.value, sent);
        errors.value = r.errors ?? [];
        if (sent.some((a) => !a.id)) await refreshAttachments(sent);
        if (!again) { savePhase.value = 'saved'; dirty.value = false; }
      } catch (e) {
        if (e instanceof FormLinkError && (e.kind === 'invalid' || e.kind === 'rate')) { fail(e); return; }
        savePhase.value = 'error';
        clearTimeout(retryTimer);
        retryTimer = setTimeout(flush, 6000); // try again by itself
        return;
      }
    } while (again);
  })().finally(() => { saving = null; });
  return saving;
};

watch([values, attachments], () => {
  if (!loaded || suppress) return;
  dirty.value = true;
  savePhase.value = 'idle';
  clearTimeout(timer);
  timer = setTimeout(flush, 900);
}, { deep: true });

const uploader = (file) => api.upload(token, file);

const submit = async () => {
  submitError.value = '';
  submitting.value = true;
  try {
    clearTimeout(timer);
    await flush();
    if (savePhase.value === 'error') throw new FormLinkError('network', "Your answers couldn't be saved yet. Check your connection and try again.");
    await api.submit(token, values.value, attachments.value);
    state.value = 'submitted';
    window.scrollTo?.({ top: 0 });
  } catch (e) {
    if (e instanceof FormLinkError && e.kind === 'validation') {
      errors.value = e.errors;
      submitError.value = 'Some answers need your attention. They are marked below.';
      await nextTick();
      renderer.value?.scrollToFirstError();
    } else if (e instanceof FormLinkError && (e.kind === 'invalid' || e.kind === 'rate')) {
      fail(e);
    } else {
      submitError.value = e?.message || 'Something went wrong. Please try again.';
    }
  } finally {
    submitting.value = false;
  }
};

const saveText = computed(() => ({ saving: 'Saving…', saved: 'All changes saved', error: "Couldn't save. Trying again…", idle: dirty.value ? 'Unsaved changes' : '' })[savePhase.value]);
const expires = computed(() => (form.value?.expiresAt ? new Date(form.value.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : ''));

const warn = (e) => { if (state.value === 'ready' && (dirty.value || saving)) { e.preventDefault(); e.returnValue = ''; } };
onMounted(() => { window.addEventListener('beforeunload', warn); if (token) load(); });
onBeforeUnmount(() => { window.removeEventListener('beforeunload', warn); clearTimeout(timer); clearTimeout(retryTimer); });

const screens = {
  invalid: { icon: 'lock', title: "This link isn't valid", body: 'It may have expired, been replaced by a newer link, or already been used to submit the form. Please ask the person who sent it for a new link.' },
  rate: { icon: 'clock', title: 'Too many requests', body: 'Please wait a minute, then try again.', retry: true },
  network: { icon: 'refresh', title: "We couldn't reach the server", body: 'Check your connection and try again.', retry: true },
  error: { icon: 'x', title: 'Something went wrong', body: 'Please try again in a moment. If it keeps happening, contact the person who sent you this link.', retry: true },
};
</script>

<template>
  <div class="min-h-screen bg-canvas text-ink">
    <header class="border-b border-line-soft bg-surface-1">
      <div class="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4 md:px-8">
        <OpIcon name="layout" :size="18" class="text-primary-text" />
        <span class="truncate text-body font-medium">{{ form?.title || 'Form' }}</span>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-12">
      <!-- loading -->
      <div v-if="state === 'loading'" class="flex items-center gap-3 text-body text-ink-muted" role="status"><OpIcon name="refresh" :size="18" class="animate-spin" />Loading your form…</div>

      <!-- invalid, rate limited, offline, error -->
      <div v-else-if="screens[state]" class="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center" role="alert">
        <span class="flex size-12 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-muted"><OpIcon :name="screens[state].icon" :size="22" /></span>
        <h1 class="text-h2 text-ink">{{ screens[state].title }}</h1>
        <p class="text-body text-ink-muted">{{ screens[state].body }}</p>
        <OpButton v-if="screens[state].retry && token" variant="secondary" icon="refresh" @click="load">Try again</OpButton>
      </div>

      <!-- thank you -->
      <div v-else-if="state === 'submitted'" class="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center" role="status">
        <span class="status-ok flex size-12 items-center justify-center rounded-full"><OpIcon name="check" :size="22" /></span>
        <h1 class="text-h2 text-ink">Thank you</h1>
        <p class="text-body text-ink-muted">Your form has been submitted. You can close this page. The link can't be used again.</p>
      </div>

      <!-- the form -->
      <template v-else-if="state === 'ready'">
        <h1 class="text-h2 text-ink md:text-h1">{{ form.title }}</h1>
        <p v-if="form.intro" class="mt-3 text-body-lg whitespace-pre-line text-ink-muted">{{ form.intro }}</p>
        <p v-if="expires" class="mt-3 text-small text-ink-faint">This link works until {{ expires }}.</p>

        <form class="mt-8 flex flex-col gap-8" novalidate @submit.prevent="submit">
          <FormRenderer
            ref="renderer"
            v-model="values"
            v-model:attachments="attachments"
            :schema="form.schema"
            :errors="errors"
            :uploader="uploader"
            :consent-text="form.consentText"
            audience="public"
          />

          <div class="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-line-soft bg-canvas/95 px-4 py-4 backdrop-blur md:-mx-8 md:px-8">
            <p v-if="submitError" class="text-body text-down" role="alert">{{ submitError }}</p>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="text-small text-ink-faint" role="status" aria-live="polite">{{ saveText }}</span>
              <OpButton type="submit" size="lg" icon="send" :disabled="submitting">{{ submitting ? 'Submitting…' : 'Submit' }}</OpButton>
            </div>
          </div>
        </form>
      </template>
    </main>

    <footer class="mx-auto max-w-3xl px-4 pb-10 text-small text-ink-faint md:px-8">Your answers are sent securely and only to the person who shared this form.</footer>
  </div>
</template>
