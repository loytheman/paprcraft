<script setup>
// Page-shaped placeholders shown while a view's data loads.
import OpSkeleton from '@ds/components/OpSkeleton.vue';

defineProps({
  kind: { type: String, required: true }, // list | detail | form | settings
});
</script>

<template>
  <div role="status" aria-label="Loading">
    <template v-if="kind === 'list'">
      <div class="grid gap-3 sm:grid-cols-3">
        <div v-for="n in 3" :key="n" class="rounded-card border border-line-soft bg-surface-1 px-4 py-3">
          <OpSkeleton class="h-3 w-20" />
          <OpSkeleton class="mt-3 h-6 w-16" />
        </div>
      </div>
      <div class="mt-6 overflow-hidden rounded-sheet border border-line bg-surface-2">
        <div v-for="n in 4" :key="n" class="grid gap-3 border-b border-line-faint px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(0,16rem)_1fr_auto] lg:items-center lg:gap-6">
          <div>
            <OpSkeleton class="h-4 w-40" />
            <OpSkeleton class="mt-2 h-3 w-56 max-w-full" />
          </div>
          <OpSkeleton class="h-6 w-full" />
          <OpSkeleton class="h-6 w-24" />
        </div>
      </div>
    </template>

    <template v-else-if="kind === 'detail'">
      <OpSkeleton class="h-8 w-64 max-w-full" />
      <OpSkeleton class="mt-3 h-3 w-80 max-w-full" />
      <div class="mt-8 grid gap-3 sm:grid-cols-3">
        <div v-for="n in 3" :key="n" class="rounded-card border border-line-soft bg-surface-1 px-4 py-3">
          <OpSkeleton class="h-3 w-20" />
          <OpSkeleton class="mt-3 h-6 w-16" />
        </div>
      </div>
      <div class="mt-6 rounded-sheet border border-line bg-surface-2 p-5">
        <OpSkeleton class="h-4 w-32" />
        <OpSkeleton class="mt-4 h-48 w-full" />
      </div>
    </template>

    <div v-else-if="kind === 'form'" class="space-y-5 rounded-sheet border border-line bg-surface-2 p-6">
      <div v-for="n in 4" :key="n">
        <OpSkeleton class="h-3 w-24" />
        <OpSkeleton class="mt-2 h-10 w-full" />
      </div>
    </div>

    <div v-else class="grid gap-6">
      <div v-for="n in 2" :key="n" class="rounded-sheet border border-line bg-surface-2 p-5">
        <OpSkeleton class="h-5 w-32" />
        <OpSkeleton class="mt-2 h-3 w-64 max-w-full" />
        <OpSkeleton class="mt-5 h-12 w-full" />
        <OpSkeleton class="mt-3 h-12 w-full" />
      </div>
    </div>
  </div>
</template>
