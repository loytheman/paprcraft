<script setup>
// The form builder, for an account's own form (mode "account") or a staff master (mode "master").
// Left: sections and fields (FormOutline). Centre: the selected section's fields as cards
// (FieldCard). Right: settings of the selected section or field (FieldSettings). A Preview tab
// renders the form the way people will fill it (FormPreview). Everything edits `form.schema` in
// place, through the pure helpers in helpers/forms/builder.js.
//
// Data: form = { id, name, description, status: draft|published, version, schema, settings, templateId }.
// Saving sends name, description, schema, settings and templateId. Publishing saves first, then asks
// the API to validate and bump the version; problems come back as e.data.problems.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, onBeforeRouteLeave } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import OpStatusBadge from '@ds/components/OpStatusBadge.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import FormOutline from './FormOutline.vue';
import FieldCard from './FieldCard.vue';
import FieldSettings from './FieldSettings.vue';
import FormSettingsDialog from './FormSettingsDialog.vue';
import FormPreview from './FormPreview.vue';
import { askConfirm } from '@/helpers/Confirm';
import { canEdit } from '@/team';
import { ownApi, masterApi } from '@/services/service.form';
import {
  LIMITS, cloneField, cloneSection, countFields, dependents, dropCondKey, dropKeyRefs, ensureIds, formSignature, groupKeys, moveChecked, newField, newSection, topKeys, validateSchema,
} from '@/helpers/forms/builder';

const props = defineProps({
  id: { type: String, required: true },
  mode: { type: String, default: 'account' }, // account | master
});
const isMaster = props.mode === 'master';
const api = isMaster ? masterApi : ownApi;
const backRoute = isMaster ? 'staff-forms' : 'forms';

const form = ref(null);
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const saveError = ref('');
const notice = ref('');
const savedSig = ref('');
const tab = ref('build'); // build | preview
const sel = ref({ s: 0 });
const showSettings = ref(false);
const showProblems = ref(false);
const publishing = ref(false);
const publishProblems = ref([]);

const readonly = computed(() => !isMaster && !canEdit.value);
const schema = computed(() => form.value.schema);
const problems = computed(() => (form.value ? validateSchema(form.value.schema) : []));
const liveSig = computed(() => (form.value ? formSignature(form.value) : ''));
const dirty = computed(() => !readonly.value && !!form.value && savedSig.value !== liveSig.value);
const published = computed(() => form.value?.status === 'published');
const fieldTotal = computed(() => (form.value ? countFields(form.value.schema) : 0));

// The selection, corrected if what it points at is gone.
const loc = computed(() => {
  const secs = form.value?.schema.sections ?? [];
  const s = Math.min(Math.max(sel.value.s ?? 0, 0), Math.max(secs.length - 1, 0));
  const f = sel.value.f;
  const field = f === undefined ? undefined : secs[s]?.fields[f];
  if (f === undefined || !field) return { s };
  if (sel.value.g !== undefined && field.group?.fields[sel.value.g]) return { s, f, g: sel.value.g };
  return { s, f };
});
const settingsKey = computed(() => {
  const { s, f, g } = loc.value;
  const sec = form.value.schema.sections[s];
  const field = f === undefined ? null : sec.fields[f];
  return `${sec.id}/${field?.id ?? ''}/${g === undefined ? '' : field.group.fields[g].id}`;
});

const select = (l) => { sel.value = { ...l }; notice.value = ''; };

// ---- loading and saving --------------------------------------------------------------------
const normalize = (f) => ({
  id: f.id,
  name: f.name ?? '',
  description: f.description ?? '',
  status: f.status ?? 'draft',
  version: f.version ?? 0,
  schema: ensureIds(f.schema),
  settings: { ...(f.settings ?? {}) },
  templateId: f.templateId ?? '',
});

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    form.value = normalize(await api.get(props.id));
    savedSig.value = formSignature(form.value);
    sel.value = { s: 0 };
    publishProblems.value = [];
  } catch (e) {
    loadError.value = e.httpStatus === 404 ? 'This form does not exist.' : e.message || 'Could not load the form.';
  }
  loading.value = false;
};

const SETTING_KEYS = ['intro', 'consentText', 'publicTitle', 'publicEnabled', 'requireApprovedToExport'];
const body = () => ({
  name: form.value.name.trim(),
  description: form.value.description ?? '',
  schema: form.value.schema,
  settings: Object.fromEntries(SETTING_KEYS.filter((k) => form.value.settings[k] !== undefined).map((k) => [k, form.value.settings[k]])),
  templateId: form.value.templateId || null,
});

const save = async () => {
  if (!form.value.name.trim()) { saveError.value = 'Give the form a name.'; return false; }
  if (problems.value.length) { saveError.value = 'Fix the problems listed below, then save.'; showProblems.value = true; return false; }
  saving.value = true;
  saveError.value = '';
  const sig = formSignature(form.value);
  try {
    const res = await api.update(props.id, body());
    if (res) { form.value.status = res.status ?? form.value.status; form.value.version = res.version ?? form.value.version; }
    savedSig.value = sig;
    saving.value = false;
    return true;
  } catch (e) {
    saveError.value = e.data?.problems?.[0] || e.fieldErrors?.[0]?.message || e.message || 'Could not save the form.';
    saving.value = false;
    return false;
  }
};

const publish = async () => {
  publishProblems.value = [];
  if (dirty.value && !(await save())) return;
  publishing.value = true;
  try {
    const res = await api.publish(props.id);
    form.value.status = res.status;
    form.value.version = res.version;
    notice.value = `Published as version ${res.version}. New submissions use it.`;
  } catch (e) {
    publishProblems.value = e.data?.problems ?? [e.message || 'Could not publish the form.'];
    showProblems.value = true;
  }
  publishing.value = false;
};

const unpublish = async () => {
  const ok = await askConfirm({ title: 'Stop new submissions?', message: 'The form goes back to a draft. Submissions already started are not affected, and customer links keep working until they expire.', confirmLabel: 'Unpublish', icon: 'pause', tone: 'primary' });
  if (!ok) return;
  try {
    const res = await api.unpublish(props.id);
    form.value.status = res.status;
    notice.value = 'The form is a draft again: no new submissions can start.';
  } catch (e) {
    saveError.value = e.message || 'Could not unpublish the form.';
  }
};

const reload = async () => {
  if (dirty.value) {
    const ok = await askConfirm({ title: 'Discard your changes?', message: 'The form goes back to the last saved version.', confirmLabel: 'Discard changes' });
    if (!ok) return;
  }
  await load();
};

// ---- sections ---------------------------------------------------------------------------------
const tooMany = (what, max) => { notice.value = `A form can have up to ${max} ${what}.`; };

const addSection = () => {
  if (schema.value.sections.length >= LIMITS.sections) return tooMany('sections', LIMITS.sections);
  schema.value.sections.push(newSection(schema.value));
  select({ s: schema.value.sections.length - 1 });
};
const afterMove = (cur, from, to) => (cur === from ? to : from < cur && to >= cur ? cur - 1 : from > cur && to <= cur ? cur + 1 : cur);
const moveSection = (from, to) => {
  const r = moveChecked(schema.value, (sc) => sc.sections, from, to);
  if (!r.ok) { notice.value = r.reason; return; }
  select({ s: afterMove(loc.value.s, from, to) });
};
const cloneSec = (i) => {
  if (fieldTotal.value + schema.value.sections[i].fields.length > LIMITS.fields) return tooMany('fields', LIMITS.fields);
  schema.value.sections.splice(i + 1, 0, cloneSection(schema.value, i));
  select({ s: i + 1 });
};
const deleteSec = async (i) => {
  const sec = schema.value.sections[i];
  const ok = await askConfirm({ title: `Delete the section "${sec.title}"?`, message: sec.fields.length ? `Its ${sec.fields.length} field${sec.fields.length === 1 ? '' : 's'} go with it. Submissions already started keep their own copy of the form.` : 'It has no fields.', confirmLabel: 'Delete section' });
  if (!ok) return;
  const keys = sec.fields.map((f) => f.key);
  schema.value.sections.splice(i, 1);
  for (const k of keys) dropKeyRefs(schema.value, k);
  select({ s: Math.min(i, schema.value.sections.length - 1) });
};

// ---- fields -----------------------------------------------------------------------------------
const section = () => schema.value.sections[loc.value.s];

const addField = (type) => {
  if (fieldTotal.value >= LIMITS.fields) return tooMany('fields', LIMITS.fields);
  const f = newField(type, topKeys(schema.value));
  section().fields.push(f);
  select({ s: loc.value.s, f: section().fields.length - 1 });
};
const moveField = (i, to) => {
  const s = loc.value.s;
  const r = moveChecked(schema.value, (sc) => sc.sections[s].fields, i, to);
  if (!r.ok) { notice.value = r.reason; return; }
  if (loc.value.f === i) select({ s, f: to, ...(loc.value.g !== undefined && { g: loc.value.g }) });
  else if (loc.value.f !== undefined) select({ s, f: afterMove(loc.value.f, i, to), ...(loc.value.g !== undefined && { g: loc.value.g }) });
};
const duplicateField = (i) => {
  if (fieldTotal.value >= LIMITS.fields) return tooMany('fields', LIMITS.fields);
  const copy = cloneField(section().fields[i], topKeys(schema.value));
  section().fields.splice(i + 1, 0, copy);
  select({ s: loc.value.s, f: i + 1 });
};
const removeField = async (i) => {
  const f = section().fields[i];
  const deps = dependents(schema.value, f.key);
  const ok = await askConfirm({
    title: `Delete "${f.label}"?`,
    message: deps.length ? `${deps.length} other ${deps.length === 1 ? 'item' : 'items'} (${deps.slice(0, 3).join(', ')}${deps.length > 3 ? '…' : ''}) only show depending on it. Those conditions are removed.` : 'Submissions already started keep their own copy of the form.',
    confirmLabel: 'Delete field',
  });
  if (!ok) return;
  section().fields.splice(i, 1);
  dropKeyRefs(schema.value, f.key);
  select({ s: loc.value.s });
};

// Fields inside a repeating group.
const addInner = (i, type) => {
  const g = section().fields[i].group;
  if (g.fields.length >= LIMITS.groupFields) return tooMany('fields in a list', LIMITS.groupFields);
  g.fields.push(newField(type, groupKeys(g)));
  select({ s: loc.value.s, f: i, g: g.fields.length - 1 });
};
const moveInner = (i, j, to) => {
  const s = loc.value.s;
  const r = moveChecked(schema.value, (sc) => sc.sections[s].fields[i].group.fields, j, to);
  if (!r.ok) { notice.value = r.reason; return; }
  if (loc.value.f === i && loc.value.g !== undefined) select({ s, f: i, g: afterMove(loc.value.g, j, to) });
};
const removeInner = (i, j) => {
  const g = section().fields[i].group;
  if (g.fields.length <= 1) return;
  const [gone] = g.fields.splice(j, 1);
  for (const gf of g.fields) { gf.visibleIf = dropCondKey(gf.visibleIf, gone.key); if (!gf.visibleIf) delete gf.visibleIf; }
  select({ s: loc.value.s, f: i });
};

// ---- housekeeping -----------------------------------------------------------------------------
const beforeUnload = (e) => { if (dirty.value) { e.preventDefault(); e.returnValue = ''; } };
const onKeydown = (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !readonly.value) { e.preventDefault(); save(); }
};
onMounted(() => { load(); window.addEventListener('beforeunload', beforeUnload); document.addEventListener('keydown', onKeydown); });
onBeforeUnmount(() => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('keydown', onKeydown); });
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  return askConfirm({ title: 'Leave without saving?', message: 'You have unsaved changes to this form.', confirmLabel: 'Leave', icon: 'x' });
});
</script>

<template>
  <PageSkeleton v-if="loading" kind="list" />
  <p v-else-if="loadError" role="alert" class="status-down rounded-control border px-3 py-2 text-small">
    {{ loadError }} <RouterLink :to="{ name: backRoute }" class="underline">Back to forms</RouterLink>
  </p>

  <div v-else-if="form">
    <p v-if="isMaster" class="mb-4 rounded-control border border-violet/40 bg-violet/10 px-3 py-2 text-small text-ink-muted">
      <strong class="font-medium text-ink">Master form.</strong> Once published, every account can copy it into its own forms, together with its document template. Changes here don't affect copies already made.
    </p>
    <p v-else-if="readonly" class="mb-4 rounded-control border border-line bg-surface-2 px-3 py-2 text-small text-ink-muted">You can look at this form, but only members of the team can change it.</p>

    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <RouterLink :to="{ name: backRoute }" class="inline-flex items-center gap-1 text-small text-ink-muted hover:text-ink"><OpIcon name="arrow-left" :size="14" /> Forms</RouterLink>
        <div class="mt-1 flex flex-wrap items-center gap-3">
          <input
            v-model="form.name"
            :readonly="readonly"
            aria-label="Form name"
            placeholder="Form name"
            class="min-w-0 max-w-xl flex-1 rounded-control border border-transparent bg-transparent px-2 py-1 text-h3 text-ink hover:border-line focus:border-cyan focus:outline-none"
          />
          <OpStatusBadge :status="published ? 'ok' : 'info'">{{ published ? `Published v${form.version}` : 'Draft' }}</OpStatusBadge>
          <span v-if="dirty" class="font-mono text-label uppercase text-warn">Unsaved changes</span>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <OpButton variant="ghost" icon="refresh" aria-label="Reload from the last saved version" @click="reload" />
        <OpButton variant="secondary" @click="showSettings = true">Settings</OpButton>
        <template v-if="!readonly">
          <OpButton variant="secondary" :disabled="saving || !dirty" @click="save">{{ saving ? 'Saving…' : 'Save' }}</OpButton>
          <OpButton v-if="published" variant="ghost" @click="unpublish">Unpublish</OpButton>
          <OpButton :disabled="publishing || saving" icon="send" @click="publish">{{ publishing ? 'Publishing…' : published ? 'Publish new version' : 'Publish' }}</OpButton>
        </template>
      </div>
    </div>

    <p v-if="saveError" role="alert" class="status-down mt-3 rounded-control border px-3 py-2 text-small">{{ saveError }}</p>
    <p v-if="notice" role="status" class="mt-3 rounded-control border border-line bg-surface-2 px-3 py-2 text-small text-ink-muted">{{ notice }}</p>
    <div v-if="publishProblems.length || (showProblems && problems.length)" role="alert" class="status-down mt-3 rounded-control border px-3 py-2 text-small">
      <p class="font-medium">{{ publishProblems.length ? 'The form can\'t be published yet:' : 'Problems to fix:' }}</p>
      <ul class="mt-1 list-disc space-y-0.5 pl-5">
        <li v-for="(p, i) in (publishProblems.length ? publishProblems : problems)" :key="i">{{ p }}</li>
      </ul>
    </div>
    <p v-else-if="problems.length" class="mt-3 text-small text-warn">
      {{ problems.length }} problem{{ problems.length === 1 ? '' : 's' }} to fix before this can be saved. <button type="button" class="underline" @click="showProblems = true">Show</button>
    </p>

    <!-- Tabs -->
    <div class="mt-5 flex gap-1 border-b border-line-soft" role="tablist">
      <button type="button" role="tab" :aria-selected="tab === 'build'" :class="['-mb-px border-b-2 px-4 py-2 text-body', tab === 'build' ? 'border-cyan text-ink' : 'border-transparent text-ink-muted hover:text-ink']" @click="tab = 'build'">Build</button>
      <button type="button" role="tab" :aria-selected="tab === 'preview'" :class="['-mb-px border-b-2 px-4 py-2 text-body', tab === 'preview' ? 'border-cyan text-ink' : 'border-transparent text-ink-muted hover:text-ink']" @click="tab = 'preview'">Preview</button>
      <span class="ml-auto self-center pr-1 font-mono text-label text-ink-faint">{{ schema.sections.length }} sections · {{ fieldTotal }} fields</span>
    </div>

    <!-- Build -->
    <div v-if="tab === 'build'" class="mt-5 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)_19rem]">
      <FormOutline
        :schema="schema"
        :sel="loc"
        :readonly="readonly"
        @select="select"
        @add-section="addSection"
        @move-section="moveSection"
        @clone-section="cloneSec"
        @delete-section="deleteSec"
      />

      <section aria-label="Fields" class="min-w-0">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="min-w-0 truncate text-h3 text-ink">{{ loc.s + 1 }}. {{ schema.sections[loc.s].title || 'Untitled section' }}</h2>
          <OpButton size="sm" variant="secondary" @click="select({ s: loc.s })">Section settings</OpButton>
        </div>
        <p v-if="schema.sections[loc.s].description" class="-mt-1 mb-3 text-small text-ink-muted">{{ schema.sections[loc.s].description }}</p>
        <FieldCard
          :schema="schema"
          :s="loc.s"
          :sel="loc"
          :readonly="readonly"
          @select="select"
          @add-field="addField"
          @move="moveField"
          @duplicate="duplicateField"
          @remove="removeField"
          @add-inner="addInner"
          @move-inner="moveInner"
          @remove-inner="removeInner"
        />
      </section>

      <aside aria-label="Settings" class="min-w-0 rounded-card border border-line bg-surface-2 p-4 lg:sticky lg:top-20 lg:self-start">
        <FieldSettings :key="settingsKey" :schema="schema" :loc="loc" :readonly="readonly" :published="published" />
      </aside>
    </div>

    <!-- Preview -->
    <div v-else class="mx-auto mt-5 max-w-3xl">
      <FormPreview :schema="schema" :consent-text="form.settings.consentText || ''" :intro="form.settings.intro || ''" />
    </div>

    <FormSettingsDialog :open="showSettings" :form="form" :mode="mode" :readonly="readonly" @close="showSettings = false" />
  </div>
</template>
