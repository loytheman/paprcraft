<script setup>
// Dev-only reference sheet for frontend/design-system. Served at /design-system.html.
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import OpLogo from '@ds/components/OpLogo.vue';
import OpStatusBadge from '@ds/components/OpStatusBadge.vue';

const surfaces = [
  ['canvas', 'bg-canvas', '#090d16'],
  ['sunken', 'bg-sunken', '#070a12'],
  ['surface-1', 'bg-surface-1', '#0d1322'],
  ['surface-2', 'bg-surface-2', '#131b2e'],
  ['surface-3', 'bg-surface-3', '#18223a'],
  ['surface-hover', 'bg-surface-hover', '#1b2540'],
];
const accents = [
  ['cyan', 'bg-cyan', '#00f0ff'],
  ['cyan-dim', 'bg-cyan-dim', '#00c4d1'],
  ['cyan-soft', 'bg-cyan-soft', '#7df4ff'],
  ['violet', 'bg-violet', '#8b5cf6'],
  ['violet-soft', 'bg-violet-soft', '#c4b5fd'],
];
const statuses = [
  ['ok', 'bg-ok', '#10b981'],
  ['warn', 'bg-warn', '#f59e0b'],
  ['down', 'bg-down', '#ef4444'],
];
const inks = [
  ['ink', 'text-ink', '#e6eaf3'],
  ['ink-muted', 'text-ink-muted', '#9aa8bd'],
  ['ink-faint', 'text-ink-faint', '#64748b'],
];
const lines = [
  ['line-faint', 'border-line-faint', '4%'],
  ['line-soft', 'border-line-soft', '6%'],
  ['line', 'border-line', '10%'],
  ['line-strong', 'border-line-strong', '16%'],
];
const type = [
  ['text-display', 'text-display', 'Know when it\'s down'],
  ['text-h1', 'text-h1', 'Section heading'],
  ['text-h2', 'text-h2', 'Section heading'],
  ['text-h3', 'text-h3', 'Card title'],
  ['text-body-lg', 'text-body-lg', 'Lead paragraph text for sections.'],
  ['text-body', 'text-body', 'Default UI and paragraph text.'],
  ['text-small', 'text-small', 'Captions and helper text.'],
  ['font-mono text-body', 'font-mono text-body', '200 OK · 118 ms · p95 84 ms'],
  ['font-mono text-label uppercase', 'font-mono text-label uppercase', 'Operational · SIN · FRA'],
];
const icons = ['activity', 'arrow-right', 'bell', 'braces', 'check', 'clock', 'globe', 'layout', 'lock', 'menu', 'pause', 'radar', 'shield', 'x', 'zap'];
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-12 md:px-8">
    <OpLogo />
    <h1 class="mt-6 text-h1 text-ink">Design system</h1>
    <p class="mt-2 max-w-2xl text-body-lg text-ink-muted">
      Tokens live in <code class="font-mono text-cyan">frontend/design-system/theme.css</code>; components in
      <code class="font-mono text-cyan">frontend/design-system/components</code>.
    </p>

    <section class="mt-14">
      <p class="eyebrow">Colour · surfaces</p>
      <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div v-for="[n, c, hex] in surfaces" :key="n" class="overflow-hidden rounded-card border border-line">
          <div :class="['h-16', c]" />
          <div class="bg-surface-1 px-3 py-2"><p class="text-small text-ink">{{ n }}</p><p class="font-mono text-label text-ink-faint">{{ hex }}</p></div>
        </div>
      </div>
    </section>

    <section class="mt-10 grid gap-10 md:grid-cols-2">
      <div>
        <p class="eyebrow">Colour · accents</p>
        <div class="mt-4 grid grid-cols-3 gap-3">
          <div v-for="[n, c, hex] in accents" :key="n" class="overflow-hidden rounded-card border border-line">
            <div :class="['h-12', c]" />
            <div class="bg-surface-1 px-3 py-2"><p class="text-small text-ink">{{ n }}</p><p class="font-mono text-label text-ink-faint">{{ hex }}</p></div>
          </div>
        </div>
      </div>
      <div>
        <p class="eyebrow">Colour · status</p>
        <div class="mt-4 grid grid-cols-3 gap-3">
          <div v-for="[n, c, hex] in statuses" :key="n" class="overflow-hidden rounded-card border border-line">
            <div :class="['h-12', c]" />
            <div class="bg-surface-1 px-3 py-2"><p class="text-small text-ink">{{ n }}</p><p class="font-mono text-label text-ink-faint">{{ hex }}</p></div>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <span class="rounded-control border px-2 py-1 font-mono text-label status-ok">status-ok</span>
          <span class="rounded-control border px-2 py-1 font-mono text-label status-warn">status-warn</span>
          <span class="rounded-control border px-2 py-1 font-mono text-label status-down">status-down</span>
          <span class="rounded-control border px-2 py-1 font-mono text-label status-info">status-info</span>
        </div>
      </div>
    </section>

    <section class="mt-10 grid gap-10 md:grid-cols-2">
      <div>
        <p class="eyebrow">Colour · text</p>
        <div class="mt-4 space-y-2 rounded-card border border-line bg-surface-1 p-4">
          <p v-for="[n, c, hex] in inks" :key="n" :class="['flex justify-between text-body', c]"><span>{{ n }}</span><span class="font-mono">{{ hex }}</span></p>
        </div>
      </div>
      <div>
        <p class="eyebrow">Lines (white at alpha)</p>
        <div class="mt-4 grid grid-cols-4 gap-3">
          <div v-for="[n, c, a] in lines" :key="n" :class="['rounded-card border-2 bg-surface-1 p-3', c]">
            <p class="text-small text-ink">{{ n }}</p><p class="font-mono text-label text-ink-faint">{{ a }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="mt-14">
      <p class="eyebrow">Type · Geist and JetBrains Mono</p>
      <div class="mt-4 divide-y divide-line-soft rounded-card border border-line bg-surface-1">
        <div v-for="[n, c, sample] in type" :key="n" class="grid gap-2 px-4 py-4 md:grid-cols-[16rem_1fr] md:items-baseline">
          <code class="font-mono text-small text-ink-faint">{{ n }}</code>
          <p :class="['text-ink', c]">{{ sample }}</p>
        </div>
      </div>
    </section>

    <section class="mt-14 grid gap-10 md:grid-cols-2">
      <div>
        <p class="eyebrow">Shape · radii</p>
        <div class="mt-4 flex gap-4">
          <div class="flex size-24 items-end rounded-control border border-line bg-surface-2 p-2 font-mono text-label text-ink-faint">control 4</div>
          <div class="flex size-24 items-end rounded-card border border-line bg-surface-2 p-2 font-mono text-label text-ink-faint">card 8</div>
          <div class="flex size-24 items-end rounded-sheet border border-line bg-surface-2 p-2 font-mono text-label text-ink-faint">sheet 12</div>
        </div>
      </div>
      <div>
        <p class="eyebrow">Depth · rim glows</p>
        <div class="mt-4 flex gap-4">
          <div class="flex size-24 items-end rounded-card border border-line bg-surface-2 p-2 font-mono text-label text-ink-faint">tier 2</div>
          <div class="flex size-24 items-end rounded-sheet border border-cyan/30 bg-surface-3 p-2 font-mono text-label text-ink-faint shadow-rim">shadow-rim</div>
          <div class="flex size-24 items-end rounded-card bg-cyan p-2 font-mono text-label text-ink-inverse shadow-glow">shadow-glow</div>
        </div>
      </div>
    </section>

    <section class="mt-14">
      <p class="eyebrow">OpButton</p>
      <div class="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-1 p-5">
        <OpButton icon="zap">Primary</OpButton>
        <OpButton variant="secondary" icon-right="arrow-right">Secondary</OpButton>
        <OpButton variant="ghost">Ghost</OpButton>
        <OpButton variant="destructive">Delete</OpButton>
        <OpButton size="sm">Small</OpButton>
        <OpButton size="lg">Large</OpButton>
      </div>
    </section>

    <section class="mt-10 grid gap-10 md:grid-cols-2">
      <div>
        <p class="eyebrow">OpStatusBadge</p>
        <div class="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-1 p-5">
          <OpStatusBadge status="ok" live>Operational</OpStatusBadge>
          <OpStatusBadge status="warn">Degraded</OpStatusBadge>
          <OpStatusBadge status="down" live>Down</OpStatusBadge>
          <OpStatusBadge status="info">Maintenance</OpStatusBadge>


        </div>
      </div>
      <div>
        <p class="eyebrow">OpIcon</p>
        <div class="mt-4 grid grid-cols-5 gap-2 rounded-card border border-line bg-surface-1 p-5 sm:grid-cols-8">
          <div v-for="n in icons" :key="n" class="flex flex-col items-center gap-1.5 py-2 text-ink-muted">
            <OpIcon :name="n" />
            <span class="font-mono text-[10px] text-ink-faint">{{ n }}</span>
          </div>
        </div>
      </div>
    </section>

  </div>
</template>
