<script setup>
// The form's own settings: name, description, what customers see on a link (title, intro, consent
// wording), whether links are allowed, whether exports wait for approval, and the output template.
// `form` is edited in place (the builder's unsaved-changes flag picks it up).
import { ref, watch } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import OpInput from '@ds/components/OpInput.vue';
import OpSelect from '@ds/components/OpSelect.vue';
import OpTextarea from '@ds/components/OpTextarea.vue';
import TplDialog from '@/components/template/TplDialog.vue';
import * as TemplateService from '@/services/service.template';

const props = defineProps({
  open: { type: Boolean, default: false },
  form: { type: Object, required: true },
  mode: { type: String, default: 'account' }, // account | master
  readonly: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const templates = ref([]);
const templatesError = ref('');
const loaded = ref(false);

watch(() => props.open, async (open) => {
  if (!open || loaded.value) return;
  try {
    templates.value = await (props.mode === 'master' ? TemplateService.listMasterTemplates() : TemplateService.listTemplates());
    templatesError.value = '';
  } catch (e) {
    templatesError.value = e.message || 'Could not load the templates.';
  }
  loaded.value = true;
});

const settings = () => (props.form.settings ??= {});
const setText = (name, v) => { if (v === '') delete settings()[name]; else settings()[name] = v; };
const templateOptions = () => {
  const list = [{ value: '', label: 'None' }, ...templates.value.map((t) => ({ value: t.id, label: t.name }))];
  const cur = props.form.templateId;
  if (cur && !list.some((o) => o.value === cur)) list.push({ value: cur, label: '(a template that is no longer listed)' });
  return list;
};
</script>

<template>
  <TplDialog :open="open" title="Form settings" wide @close="emit('close')">
    <fieldset :disabled="readonly" class="m-0 min-w-0 space-y-4 border-0 p-0">
      <OpInput v-model="form.name" label="Name" required />
      <OpTextarea v-model="form.description" label="Description" hint="For your team. Not shown to customers." :rows="2" />

      <div class="space-y-4 rounded-card border border-line bg-surface-2 p-4">
        <p class="eyebrow">Customer link</p>
        <label class="flex items-start gap-2 text-body text-ink">
          <input type="checkbox" class="mt-0.5 size-4 accent-cyan" :checked="!!settings().publicEnabled" @change="settings().publicEnabled = $event.target.checked" />
          <span>Let customers fill this form through a link<span class="block text-small text-ink-faint">Turns on "Share link" on submissions. Fields marked "Officer use only" are never shown.</span></span>
        </label>
        <OpInput :model-value="settings().publicTitle ?? ''" label="Heading on the link page" hint="Defaults to the submission's title." @update:model-value="setText('publicTitle', $event)" />
        <OpTextarea :model-value="settings().intro ?? ''" label="Introduction" hint="Shown above the questions on the link page." :rows="3" @update:model-value="setText('intro', $event)" />
        <OpTextarea :model-value="settings().consentText ?? ''" label="Consent wording" hint="Next to the signature tick box. Leave empty for the standard wording." :rows="3" @update:model-value="setText('consentText', $event)" />
      </div>

      <label class="flex items-start gap-2 text-body text-ink">
        <input type="checkbox" class="mt-0.5 size-4 accent-cyan" :checked="!!settings().requireApprovedToExport" @change="settings().requireApprovedToExport = $event.target.checked" />
        <span>Only approved submissions can be exported<span class="block text-small text-ink-faint">Generating the document waits until a submission is approved.</span></span>
      </label>

      <div>
        <OpSelect :model-value="form.templateId ?? ''" label="Document template" :options="templateOptions()" hint="The document a submission is turned into (Generate). Its placeholders are this form's field keys." @update:model-value="form.templateId = $event" />
        <p v-if="templatesError" role="alert" class="status-down mt-2 rounded-control border px-3 py-2 text-small">{{ templatesError }}</p>
      </div>
    </fieldset>
    <template #footer><OpButton @click="emit('close')">Done</OpButton></template>
  </TplDialog>
</template>
