<script setup>
// A string with {{key|pipe}} tokens drawn as pills, the way chips look in the text. Used by the
// previews of the section table, checklist and declaration blocks and by the page setup preview.
import { computed } from 'vue';

const props = defineProps({ text: { type: String, default: '' }, empty: { type: String, default: '' } });
const parts = computed(() => {
  const out = [];
  let last = 0;
  const s = props.text ?? '';
  for (const m of s.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    if (m.index > last) out.push({ t: s.slice(last, m.index) });
    out.push({ token: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last) });
  return out;
});
</script>

<template>
  <span v-if="!parts.length" class="text-ink-faint italic">{{ empty }}</span>
  <template v-else>
    <template v-for="(p, i) in parts" :key="i">
      <span v-if="p.token" class="mx-0.5 inline-block rounded-full border border-primary/40 bg-primary/10 px-1.5 font-mono text-[0.7rem] leading-5 text-primary-text">{{ p.token }}</span>
      <template v-else>{{ p.t }}</template>
    </template>
  </template>
</template>
