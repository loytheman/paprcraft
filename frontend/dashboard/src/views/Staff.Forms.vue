<script setup>
// Staff: the master forms every account can copy. Create, open, delete.
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import OpButton from '@ds/components/OpButton.vue';
import OpInput from '@ds/components/OpInput.vue';
import OpStatusBadge from '@ds/components/OpStatusBadge.vue';
import PageSkeleton from '@/components/PageSkeleton.vue';
import * as FormService from '@/services/service.form';
import { askConfirm } from '@/helpers/Confirm';
import { formatDateTime } from '@/helpers/Format';

const router = useRouter();
const masters = ref([]);
const loaded = ref(false);
const error = ref('');

const load = async () => {
  try {
    masters.value = await FormService.listMasterForms();
    error.value = '';
  } catch (e) {
    error.value = e.message || 'Could not load the master forms.';
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
    const f = await FormService.createMasterForm({ name: name.value.trim() });
    router.push({ name: 'staff-form', params: { id: f.id } });
  } catch (e) {
    createError.value = e.fieldErrors?.[0]?.message || e.message || 'Could not create the form.';
  }
  busy.value = false;
};
const remove = async (f) => {
  const ok = await askConfirm({ title: `Delete the master "${f.name}"?`, message: 'Copies accounts already made are not affected.', confirmLabel: 'Delete master' });
  if (!ok) return;
  try {
    await FormService.deleteMasterForm(f.id);
    await load();
  } catch (e) {
    error.value = e.message || 'Could not delete the form.';
  }
};
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <p class="eyebrow">Staff</p>
    <h1 class="mt-2 text-h2 text-ink">Master forms</h1>
    <p class="mt-2 text-body text-ink-muted">Every account sees these under Forms &gt; Master forms and can copy one, with its document template, into its own forms. Publish a master for it to be useful.</p>

    <form class="mt-6 flex flex-wrap items-end gap-3 rounded-sheet border border-line bg-surface-2 p-4" @submit.prevent="create">
      <OpInput v-model="name" class="w-72" label="New master form" placeholder="e.g. Customer due diligence (individual)" :error="createError" />
      <OpButton type="submit" icon="plus" :disabled="busy || !name.trim()">{{ busy ? 'Creating…' : 'Create and open' }}</OpButton>
    </form>

    <p v-if="error" role="alert" class="status-down mt-6 rounded-control border px-3 py-2 text-small">{{ error }}</p>
    <PageSkeleton v-if="!loaded" kind="list" class="mt-8" />
    <section v-else class="mt-6 overflow-hidden rounded-sheet border border-line bg-surface-2">
      <p v-if="!masters.length" class="px-6 py-10 text-center text-body text-ink-muted">No master forms yet.</p>
      <ul v-else>
        <li v-for="f in masters" :key="f.id" class="flex flex-wrap items-center justify-between gap-3 border-b border-line-faint px-5 py-3 last:border-b-0">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <RouterLink :to="{ name: 'staff-form', params: { id: f.id } }" class="text-body font-medium text-ink hover:text-primary-active">{{ f.name }}</RouterLink>
              <OpStatusBadge :status="f.status === 'published' ? 'ok' : 'info'">{{ f.status === 'published' ? `Published v${f.version}` : 'Draft' }}</OpStatusBadge>
            </div>
            <p class="text-small text-ink-faint">Edited {{ formatDateTime(f.updatedAt) }}</p>
          </div>
          <div class="flex gap-2">
            <RouterLink :to="{ name: 'staff-form', params: { id: f.id } }"><OpButton size="sm" variant="secondary">Open</OpButton></RouterLink>
            <OpButton size="sm" variant="destructive" icon="trash" @click="remove(f)">Delete</OpButton>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
