<script setup>
// Renders an <a> when `href` is set, else a <button>.
import { computed } from 'vue';
import OpIcon from './OpIcon.vue';

const props = defineProps({
  variant: { type: String, default: 'primary' }, // primary | secondary | ghost | destructive
  size: { type: String, default: 'md' }, // sm | md | lg
  href: { type: String, default: '' },
  icon: { type: String, default: '' },
  iconRight: { type: String, default: '' },
  block: { type: Boolean, default: false },
});

const variants = {
  primary: 'bg-cyan text-ink-inverse border-cyan hover:bg-cyan-soft active:shadow-glow',
  secondary: 'bg-transparent text-ink border-line-strong hover:bg-white/4 hover:border-white/30',
  ghost: 'bg-transparent text-ink-muted border-transparent hover:text-ink',
  destructive: 'status-down hover:bg-down/20',
};
const sizes = {
  sm: 'h-8 px-3 text-small gap-1.5',
  md: 'h-10 px-4 text-body gap-2',
  lg: 'h-12 px-5 text-body-lg gap-2',
};

const classes = computed(() => [
  'inline-flex items-center justify-center rounded-control border font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
  variants[props.variant],
  sizes[props.size],
  props.block && 'w-full',
]);
const iconSize = computed(() => (props.size === 'lg' ? 18 : 16));
</script>

<template>
  <component :is="href ? 'a' : 'button'" :href="href || undefined" :class="classes">
    <OpIcon v-if="icon" :name="icon" :size="iconSize" />
    <slot />
    <OpIcon v-if="iconRight" :name="iconRight" :size="iconSize" />
  </component>
</template>
