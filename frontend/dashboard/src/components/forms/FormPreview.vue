<script setup>
// Live preview of the form being built, rendered with the shared FormRenderer (the same component
// accounts and customers fill the form with). Nothing here is saved.
import { computed, ref, watch } from 'vue';
import OpButton from '@ds/components/OpButton.vue';
import FormRenderer from '@ds/components/FormRenderer.vue';
import { publicSchema } from '@ds/lib/forms.js';

const props = defineProps({
  schema: { type: Object, required: true },
  consentText: { type: String, default: '' },
  intro: { type: String, default: '' },
});

const audience = ref('account'); // account | public: what an officer sees, or what a customer sees
const values = ref({});
const attachments = ref([]);
const errors = ref([]);
const shown = computed(() => (audience.value === 'public' ? publicSchema(props.schema) : props.schema));
const uploader = async (file) => ({ key: `preview/${file.name}`, name: file.name }); // nothing is uploaded
const reset = () => { values.value = {}; attachments.value = []; errors.value = []; };
watch(audience, reset);
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="inline-flex rounded-control border border-line p-0.5" role="group" aria-label="Preview as">
        <button type="button" :class="['rounded-control px-3 py-1 text-small', audience === 'account' ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink']" @click="audience = 'account'">As your team</button>
        <button type="button" :class="['rounded-control px-3 py-1 text-small', audience === 'public' ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink']" @click="audience = 'public'">As a customer</button>
      </div>
      <OpButton size="sm" variant="secondary" icon="refresh" @click="reset">Clear answers</OpButton>
    </div>
    <p class="mb-4 text-small text-ink-faint">Try it: nothing you type here is saved. {{ audience === 'public' ? 'Fields marked "Officer use only" are hidden.' : 'Your team sees every field.' }}</p>

    <p v-if="intro && audience === 'public'" class="mb-4 whitespace-pre-line rounded-card border border-line bg-surface-2 px-4 py-3 text-body text-ink-muted">{{ intro }}</p>

    <FormRenderer
      v-model="values"
      v-model:attachments="attachments"
      :schema="shown"
      :errors="errors"
      :audience="audience"
      :uploader="uploader"
      :consent-text="consentText"
    />
  </div>
</template>
