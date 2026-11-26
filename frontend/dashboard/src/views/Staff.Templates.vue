<script setup>
// Staff: the master templates every account can copy. Create, open, delete.
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import RowMenu from '@/components/RowMenu.vue';
import { ROW_CLICKABLE, onRow } from '@/helpers/rowClick';
import OpInput from '@ds/components/OpInput.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import * as TemplateService from '@/services/service.template';
import { askConfirm } from '@/helpers/Confirm';
import { formatDateTime } from '@/helpers/Format';

const router = useRouter();
const masters = ref([]);
const loaded = ref(false);
const error = ref('');

const load = async () => {
  try {
    masters.value = await TemplateService.listMasterTemplates();
    error.value = '';
  } catch (e) {
    error.value = e.message || 'Could not load the master templates.';
  }
  loaded.value = true;
};
onMounted(load);

const name = ref('');
const createError = ref('');
const busy = ref(false);
const create = async () => {
  busy.value = true;
  createError.value = '';
  try {
    const t = await TemplateService.createMasterTemplate({ name: name.value.trim() });
    router.push({ name: 'staff-template', params: { id: t.id } });
  } catch (e) {
    createError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not create the template.';
  }
  busy.value = false;
};
const remove = async (t) => {
  const ok = await askConfirm({ title: `Delete the master "${t.name}"?`, message: 'Copies accounts already made are not affected.', confirmLabel: 'Delete master' });
  if (!ok) return;
  try {
    await TemplateService.deleteMasterTemplate(t.id);
    await load();
  } catch (e) {
    error.value = e.message || 'Could not delete the template.';
  }
};
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <p class="eyebrow">Staff</p>
    <h1 class="mt-2 text-h2 text-ink">Master templates</h1>
    <p class="mt-2 text-body text-ink-muted">Every account sees these under Templates and can copy one into its own templates.</p>

    <form class="mt-6 flex flex-wrap items-end gap-3 rounded-sheet border border-line bg-surface-2 p-4" @submit.prevent="create">
      <OpInput v-model="name" class="w-72" label="New master template" placeholder="e.g. AGM notice" :error="createError" />
      <OpButton type="submit" icon="plus" :disabled="busy || !name.trim()">{{ busy ? 'Creating…' : 'Create and open' }}</OpButton>
    </form>

    <p v-if="error" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ error }}</p>
    <PageSkeleton v-if="!loaded" kind="list" class="mt-8" />
    <section v-else class="mt-6 rounded-sheet border border-line bg-surface-2">
      <p v-if="!masters.length" class="px-6 py-10 text-center text-body text-ink-muted">No master templates yet.</p>
      <ul v-else>
        <li v-for="t in masters" :key="t.id" :class="['flex flex-wrap items-center justify-between gap-3 border-b border-line-faint px-5 py-3 last:border-b-0', ROW_CLICKABLE]" @click="onRow($event, () => router.push({ name: 'staff-template', params: { id: t.id } }))">
          <div class="min-w-0">
            <RouterLink :to="{ name: 'staff-template', params: { id: t.id } }" class="text-body font-medium text-ink hover:text-primary-active">{{ t.name }}</RouterLink>
            <p class="text-small text-ink-faint">Edited {{ formatDateTime(t.updatedAt) }}</p>
          </div>
          <div class="flex items-center gap-1">
            <RouterLink :to="{ name: 'staff-template', params: { id: t.id } }"><OpButton size="sm" variant="secondary">Open</OpButton></RouterLink>
            <RowMenu :label="`More actions for ${t.name}`" :items="[{ label: 'Delete', icon: 'trash', danger: true, action: () => remove(t) }]" />
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
