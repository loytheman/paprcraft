<script setup>
// "Sign in with Google" in Google's own button style (white, the four-colour G), the one place a
// non-system colour is allowed. A plain link: clicking shows a spinner while the browser leaves for
// the API's /auth/google/start, and blocks double clicks.
import { onBeforeUnmount, onMounted, ref } from 'vue';

defineProps({
  href: { type: String, required: true },
  label: { type: String, default: 'Sign in with Google' },
  size: { type: String, default: 'md' }, // sm | md | lg
  block: { type: Boolean, default: false },
});

const loading = ref(false);
const onClick = (e) => {
  if (loading.value) e.preventDefault();
  else loading.value = true;
};
// Coming back with the browser's Back button restores the page from cache with loading still on.
const reset = (e) => { if (e.persisted) loading.value = false; };
onMounted(() => window.addEventListener('pageshow', reset));
onBeforeUnmount(() => window.removeEventListener('pageshow', reset));

const sizes = { sm: 'h-8 px-3 text-small gap-2', md: 'h-10 px-4 text-body gap-2.5', lg: 'h-12 px-5 text-body-lg gap-3' };
</script>

<template>
  <a
    :href="href"
    :aria-busy="loading"
    :class="[
      'inline-flex items-center justify-center whitespace-nowrap rounded-control border border-[#dadce0] bg-white font-medium text-[#1f1f1f] transition-colors hover:bg-[#f2f2f2]',
      sizes[size],
      block && 'w-full',
      loading && 'cursor-wait opacity-80',
    ]"
    @click="onClick"
  >
    <svg v-if="loading" class="size-4 animate-spin text-[#5f6368]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.2-8.56" stroke-linecap="round" />
    </svg>
    <svg v-else class="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24Z" />
      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.97 0 12s.45 3.83 1.25 5.42l4.03-3.15Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z" />
    </svg>
    {{ loading ? 'Redirecting…' : label }}
  </a>
</template>
