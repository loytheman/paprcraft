<script setup>
// One submission: the form (FormRenderer from the design system) with autosave while it is a draft,
// submit, the review decision, a customer link, files, the customer's signature, and the generated
// documents. Staff of the account (not viewers) can change things; viewers only look.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpInput from '@ds/components/OpInput.vue';
import OpStatusBadge from '@ds/components/OpStatusBadge.vue';
import FormRenderer from '@ds/components/FormRenderer.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import DocumentsCard from '@/components/submission/DocumentsCard.vue';
import FilesCard from '@/components/submission/FilesCard.vue';
import ReviewPanel from '@/components/submission/ReviewPanel.vue';
import ShareLinkCard from '@/components/submission/ShareLinkCard.vue';
import SignatureCard from '@/components/submission/SignatureCard.vue';
import * as SubmissionService from '@/services/service.submission';
import { askConfirm } from '@/helpers/Confirm';
import { actionsFor, mapSubmitErrors, reconcileAttachments, statusMeta, toRendererAttachments, toSaveAttachments } from '@/helpers/forms/submission';
import { role } from '@/team';

const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id);

const sub = ref(null);
const form = ref(null);
const loaded = ref(false);
const loadError = ref('');

// What the user edits (kept apart from `sub` so a save never overwrites typing in flight).
const values = ref({});
const attachments = ref([]);
const title = ref('');
const answerErrors = ref([]);
const message = ref('');
const renderer = ref(null);

const can = computed(() => actionsFor(sub.value?.status, role.value));
const readonly = computed(() => !can.value.editAnswers);
const meta = computed(() => statusMeta(sub.value?.status));
const clone = (x) => JSON.parse(JSON.stringify(x ?? {}));
const payload = () => ({ title: title.value.trim(), values: values.value, attachments: toSaveAttachments(attachments.value) });

// ---- loading -------------------------------------------------------------------------------------------

let lastSaved = '';
const adopt = (s) => {
  sub.value = s;
  values.value = clone(s.values);
  attachments.value = toRendererAttachments(s.attachments);
  title.value = s.title ?? '';
  lastSaved = JSON.stringify(payload());
  saveState.value = 'saved';
};

const load = async () => {
  try {
    adopt(await SubmissionService.getSubmission(id.value));
    loadError.value = '';
  } catch (e) {
    loadError.value = e.httpStatus === 404 ? 'This submission does not exist, or it belongs to another account.' : e.message || 'Could not load the submission.';
  }
  loaded.value = true;
  // The form's settings (output template, customer links); the page still works without them.
  if (sub.value) SubmissionService.getFormInfo(sub.value.formId).then((f) => { form.value = f; }).catch(() => { form.value = null; });
};
onMounted(load);

// ---- autosave ------------------------------------------------------------------------------------------

const saveState = ref('saved'); // saved | dirty | saving | error
const saveError = ref('');
let timer = null;
let inflight = null;

const save = () => {
  clearTimeout(timer);
  if (inflight) return inflight.then(() => (isDirty() ? save() : undefined)); // one save at a time
  if (!isDirty()) return Promise.resolve();
  const body = payload();
  const sent = JSON.stringify(body);
  saveState.value = 'saving';
  inflight = (async () => {
    try {
      const res = await SubmissionService.saveSubmission(id.value, clone(body));
      const unchanged = JSON.stringify(payload()) === sent;
      attachments.value = reconcileAttachments(body.attachments, attachments.value, res.attachments ?? []);
      sub.value = { ...sub.value, updatedAt: res.updatedAt, attachments: res.attachments, link: res.link ?? sub.value.link };
      answerErrors.value = res.errors ?? [];
      // Typed more while saving: the next save carries it.
      lastSaved = unchanged ? JSON.stringify(payload()) : sent;
      saveError.value = '';
      saveState.value = unchanged ? 'saved' : 'dirty';
    } catch (e) {
      saveState.value = 'error';
      saveError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not save.';
    } finally {
      inflight = null;
    }
    if (saveState.value === 'dirty') timer = setTimeout(save, 400);
  })();
  return inflight;
};
const isDirty = () => !readonly.value && !!sub.value && JSON.stringify(payload()) !== lastSaved;

watch([values, attachments, title], () => {
  if (!loaded.value || readonly.value || !sub.value) return;
  if (!isDirty()) return;
  if (saveState.value !== 'saving') saveState.value = 'dirty';
  clearTimeout(timer);
  timer = setTimeout(save, 1200);
}, { deep: true });

// Writes anything pending; rejects if it could not be saved.
const flush = async () => {
  clearTimeout(timer);
  if (inflight) await inflight;
  if (isDirty()) await save();
  if (saveState.value === 'error') throw { message: `Your answers could not be saved: ${saveError.value}` };
};

onBeforeRouteLeave(async () => {
  if (readonly.value || saveState.value === 'saved') return true;
  try { await flush(); return true; } catch {
    return window.confirm('Your latest answers could not be saved. Leave anyway?');
  }
});
const warnUnload = (e) => { if (!readonly.value && (saveState.value === 'dirty' || saveState.value === 'saving')) { e.preventDefault(); e.returnValue = ''; } };
window.addEventListener('beforeunload', warnUnload);
onBeforeUnmount(() => { clearTimeout(timer); window.removeEventListener('beforeunload', warnUnload); });

// ---- actions ---------------------------------------------------------------------------------------------

const uploader = (file) => SubmissionService.uploadFile(id.value, file);

const submitting = ref(false);
const onSubmit = async () => {
  message.value = '';
  answerErrors.value = [];
  submitting.value = true;
  try {
    await flush();
    adopt(await SubmissionService.submitSubmission(id.value));
  } catch (e) {
    const m = mapSubmitErrors(e);
    answerErrors.value = m.errors;
    message.value = m.message;
    await nextTick();
    renderer.value?.scrollToFirstError?.();
  }
  submitting.value = false;
};

const onUpdated = (s) => { message.value = ''; answerErrors.value = []; adopt(s); };
const refreshLink = async () => { try { sub.value = { ...sub.value, link: (await SubmissionService.getSubmission(id.value)).link }; } catch { /* the card keeps its old state */ } };
const onHistory = (history) => { sub.value = { ...sub.value, exportHistory: history }; };

const remove = async () => {
  const ok = await askConfirm({ title: `Delete "${sub.value.title || sub.value.formName}"?`, message: 'The answers, files and generated documents are deleted. This cannot be undone.', confirmLabel: 'Delete submission' });
  if (!ok) return;
  try {
    await SubmissionService.deleteSubmission(id.value);
    router.replace({ name: 'submissions' });
  } catch (e) {
    message.value = e.message || 'Could not delete the submission.';
  }
};

const linksEnabled = computed(() => (form.value ? !!form.value.settings?.publicEnabled : true));
const showLinkCard = computed(() => can.value.share || sub.value?.link?.active || sub.value?.link?.locked);
const saveText = computed(() => ({ saved: 'All changes saved', dirty: 'Unsaved changes…', saving: 'Saving…', error: 'Not saved' }[saveState.value]));
const consent = computed(() => form.value?.settings?.consentText ?? '');
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <RouterLink :to="{ name: 'submissions' }" class="text-small text-ink-muted hover:text-ink">← Submissions</RouterLink>

    <PageSkeleton v-if="!loaded" kind="detail" class="mt-6" />
    <p v-else-if="loadError" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-body">{{ loadError }}</p>

    <template v-else>
      <header class="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <p class="eyebrow">{{ sub.formName }}<span v-if="sub.formVersion"> · version {{ sub.formVersion }}</span></p>
          <OpInput v-if="can.editAnswers" v-model="title" class="mt-2 max-w-md" label="Title" placeholder="e.g. Acme Pte Ltd" />
          <h1 v-else class="mt-2 text-h2 text-ink">{{ sub.title || sub.formName }}</h1>
        </div>
        <div class="flex flex-col items-end gap-2">
          <OpStatusBadge :status="meta.tone">{{ meta.label }}</OpStatusBadge>
          <p v-if="can.editAnswers" class="text-small" :class="saveState === 'error' ? 'text-down' : 'text-ink-faint'" role="status">
            {{ saveText }}<template v-if="saveState === 'error'">: {{ saveError }} <button type="button" class="underline" @click="save">Try again</button></template>
          </p>
        </div>
      </header>

      <p v-if="message" role="alert" class="status-down mt-4 rounded-control border px-3 py-2 text-body">{{ message }}</p>
      <p v-if="role === 'viewer'" class="mt-4 text-small text-ink-faint">You can view this submission but not change it.</p>

      <div class="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div class="space-y-6">
          <section class="rounded-sheet border border-line bg-surface-2 p-5 md:p-6" aria-label="Answers">
            <FormRenderer
              ref="renderer"
              v-model="values"
              v-model:attachments="attachments"
              :schema="sub.schema"
              :errors="answerErrors"
              :readonly="readonly"
              audience="account"
              :uploader="uploader"
              :consent-text="consent"
            />
            <div v-if="can.submit" class="mt-6 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
              <OpButton icon="check" :disabled="submitting || saveState === 'saving'" @click="onSubmit">{{ submitting ? 'Submitting…' : 'Submit' }}</OpButton>
              <span class="text-small text-ink-faint">Checks that the required answers are filled in, then sends it for review.</span>
            </div>
          </section>

          <FilesCard v-if="readonly" :submission="sub" />
          <SignatureCard v-if="sub.signature" :signature="sub.signature" />
        </div>

        <aside class="space-y-6 lg:sticky lg:top-24" aria-label="Actions">
          <ReviewPanel :submission="sub" :can="can" @updated="onUpdated" />
          <ShareLinkCard v-if="showLinkCard" :submission="sub" :can-share="can.share" :can-revoke="can.share" :links-enabled="linksEnabled" @changed="refreshLink" />
          <DocumentsCard :submission="sub" :form="form" :role="role" :dirty="saveState !== 'saved'" :flush="flush" @history="onHistory" />
          <OpButton v-if="can.remove" variant="destructive" size="sm" icon="trash" @click="remove">Delete submission</OpButton>
        </aside>
      </div>
    </template>
  </div>
</template>
