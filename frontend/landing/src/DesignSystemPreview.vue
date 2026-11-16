<script setup>
// Dev-only reference sheet for frontend/design-system. Served at /design-system.html.
import OpButton from '@ds/components/OpButton.vue';
import OpIcon from '@ds/components/OpIcon.vue';
import OpLogo from '@ds/components/OpLogo.vue';
import OpLabel from '@ds/components/OpLabel.vue';
import OpStatusBadge from '@ds/components/OpStatusBadge.vue';
import OpCheckbox from '@ds/components/OpCheckbox.vue';
import OpRadio from '@ds/components/OpRadio.vue';
import FormRenderer from '@ds/components/FormRenderer.vue';
import { ref, reactive, onMounted } from 'vue';

// FormRenderer demo
const formSchema = {
  sections: [{ id: 's1', title: 'Customer', description: 'A dynamic form: answer "Company" to reveal a field.', fields: [
    { id: '1', key: 'full_name', type: 'text', label: 'Full name', required: true },
    { id: '2', key: 'kind', type: 'select', label: 'Kind', options: [{ value: 'ind', label: 'Individual' }, { value: 'co', label: 'Company' }] },
    { id: '3', key: 'company', type: 'text', label: 'Company name', visibleIf: { key: 'kind', op: 'eq', value: 'co' } },
    { id: '4', key: 'pep', type: 'yesno', label: 'Is a PEP?' },
    { id: '5', key: 'owners', type: 'group', label: 'Owner', group: { fields: [{ id: 'g1', key: 'name', type: 'text', label: 'Name' }, { id: 'g2', key: 'pct', type: 'number', label: 'Percent' }] } },
  ] }],
};
const formValues = ref({});
const checked = ref(true);
const radio = ref('b');

// Colours are listed by NAME only. The values are read from the live CSS (tokens.css), so this sheet
// can't drift from the constants: edit a value there and it shows here.
const palettes = {
  slate: [50, 100, 200, 300, 400, 500, 600, 900], mint: [50, 200, 300, 400, 500, 600, 700, 800],
  lemon: [50, 200, 300, 400, 600, 800, 900], sky: [50, 200, 600, 800], red: [50, 200, 500, 600, 700],
};
const roleGroups = [
  ['Surfaces', ['canvas', 'sunken', 'surface-1', 'surface-2', 'surface-3', 'surface-hover']],
  ['Lines', ['line-faint', 'line-soft', 'line', 'line-strong']],
  ['Text', ['ink', 'ink-muted', 'ink-faint', 'ink-disabled', 'ink-inverse']],
  ['Primary (mint)', ['primary', 'primary-hover', 'primary-active', 'primary-text', 'primary-bright', 'primary-soft', 'primary-edge', 'primary-ink']],
  ['Secondary (lemon)', ['secondary', 'secondary-bright', 'secondary-soft', 'secondary-edge', 'secondary-line', 'secondary-ink', 'secondary-text']],
  ['Tertiary (sky)', ['tertiary', 'tertiary-soft', 'tertiary-edge', 'tertiary-ink']],
  ['Status', ['ok', 'ok-soft', 'warn', 'warn-soft', 'down', 'down-soft', 'down-bg', 'down-edge', 'down-ink']],
  ['Code', ['code', 'code-ink']],
];
const labelNames = ['cyan', 'blue', 'indigo', 'violet', 'fuchsia', 'pink', 'slate', 'stone'];
const hexes = reactive({});
const toHex = (rgb) => {
  const m = rgb.match(/[\d.]+/g)?.map(Number) ?? [];
  if (m.length < 3) return rgb;
  const k = rgb.startsWith('color(') ? 255 : 1; // color(srgb 0.9 0.9 0.9 / 0.8) has 0-1 channels
  const h = m.slice(0, 3).map((n) => Math.round(n * k).toString(16).padStart(2, '0')).join('');
  return `#${h}${m[3] !== undefined && m[3] < 1 ? ` · ${Math.round(m[3] * 100)}%` : ''}`;
};
const resolve = (cssVar) => {
  const el = document.createElement('i');
  el.style.color = `var(${cssVar})`;
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).color;
  el.remove();
  return toHex(rgb);
};
onMounted(() => {
  for (const [group, steps] of Object.entries(palettes)) for (const n of steps) hexes[`palette-${group}-${n}`] = resolve(`--palette-${group}-${n}`);
  for (const [, names] of roleGroups) for (const n of names) hexes[n] = resolve(`--color-${n}`);
  for (const n of labelNames) hexes[`label-${n}`] = resolve(`--label-${n}`);
});
const type = [
  ['text-display', 'text-display', 'Know when it\'s down'],
  ['text-h1', 'text-h1', 'Section heading'],
  ['text-h2', 'text-h2', 'Section heading'],
  ['text-h3', 'text-h3', 'Card title'],
  ['text-body-lg', 'text-body-lg', 'Lead paragraph text for sections.'],
  ['text-body', 'text-body', 'Default UI and paragraph text.'],
  ['text-small', 'text-small', 'Captions and helper text.'],
  ['font-mono text-body', 'font-mono text-body', '200 OK · 118 ms · p95 84 ms'],
  ['text-label uppercase', 'text-label uppercase', 'Operational · SIN · FRA'],
];
const icons = ['activity', 'arrow-right', 'bell', 'braces', 'check', 'clock', 'globe', 'layout', 'lock', 'menu', 'pause', 'radar', 'shield', 'x', 'zap'];
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-12 md:px-8">
    <OpLogo />
    <h1 class="mt-6 text-h1 text-ink">Design system</h1>
    <p class="mt-2 max-w-2xl text-body-lg text-ink-muted">
      Tokens live in <code class="font-mono text-primary-text">frontend/design-system/tokens.css</code> (constants) and <code class="font-mono text-primary-text">theme.css</code> (roles); components in
      <code class="font-mono text-primary-text">frontend/design-system/components</code>.
    </p>

    <section class="mt-14">
      <p class="eyebrow">Palette · constants in tokens.css</p>
      <p class="mt-2 text-body text-ink-muted">Raw colour steps. Components never use these directly; they use the roles below. Re-skin by editing <code class="font-mono text-primary-text">tokens.css</code>.</p>
      <div v-for="(steps, group) in palettes" :key="group" class="mt-4">
        <p class="mb-2 text-small font-semibold capitalize text-ink">{{ group }}</p>
        <div class="flex flex-wrap gap-2">
          <div v-for="n in steps" :key="n" class="w-24 overflow-hidden rounded-control border border-line">
            <div class="h-10" :style="{ backgroundColor: `var(--palette-${group}-${n})` }" />
            <div class="bg-surface-1 px-2 py-1.5"><p class="text-label text-ink">{{ group }}-{{ n }}</p><p class="text-label text-ink-faint">{{ hexes[`palette-${group}-${n}`] }}</p></div>
          </div>
        </div>
      </div>
    </section>

    <section class="mt-14">
      <p class="eyebrow">Colour roles · theme.css</p>
      <div v-for="[group, names] in roleGroups" :key="group" class="mt-5">
        <p class="mb-2 text-small font-semibold text-ink">{{ group }}</p>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <div v-for="n in names" :key="n" class="overflow-hidden rounded-control border border-line">
            <div class="h-12" :style="{ backgroundColor: `var(--color-${n})` }" />
            <div class="bg-surface-1 px-3 py-2"><p class="text-small text-ink">{{ n }}</p><p class="text-label text-ink-faint">{{ hexes[n] }}</p></div>
          </div>
        </div>
      </div>
      <p class="mb-2 mt-5 text-small font-semibold text-ink">Chips (status-*)</p>
      <div class="flex flex-wrap gap-2">
        <span class="rounded-full border px-3 py-1 text-label uppercase status-ok">status-ok</span>
        <span class="rounded-full border px-3 py-1 text-label uppercase status-warn">status-warn</span>
        <span class="rounded-full border px-3 py-1 text-label uppercase status-down">status-down</span>
        <span class="rounded-full border px-3 py-1 text-label uppercase status-info">status-info</span>
        <span class="rounded-full border px-3 py-1 text-label uppercase status-neutral">status-neutral</span>
      </div>
      <p class="mb-2 mt-5 text-small font-semibold text-ink">Label colours</p>
      <div class="flex flex-wrap gap-2"><OpLabel v-for="n in labelNames" :key="n" :name="n" :color="n" /></div>
    </section>

    <section class="mt-14">
      <p class="eyebrow">Type · Plus Jakarta Sans and JetBrains Mono</p>
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
          <div class="flex size-24 items-end rounded-control border border-line bg-surface-2 p-2 text-label text-ink-faint">control 8</div>
          <div class="flex size-24 items-end rounded-card border border-line bg-surface-2 p-2 text-label text-ink-faint">card 16</div>
          <div class="flex size-24 items-end rounded-sheet border border-line bg-surface-2 p-2 text-label text-ink-faint">sheet 24</div>
          <div class="flex h-24 w-24 items-end rounded-full border border-line bg-surface-2 p-3 text-label text-ink-faint">pill</div>
        </div>
      </div>
      <div>
        <p class="eyebrow">Depth · shadows</p>
        <div class="mt-4 flex flex-wrap gap-4">
          <div class="flex size-24 items-end rounded-card border border-line bg-surface-1 p-2 text-label text-ink-faint shadow-rim">rim</div>
          <div class="flex size-24 items-end rounded-card border border-line-strong bg-surface-1 p-2 text-label text-ink-faint shadow-pop">pop</div>
          <div class="flex size-24 items-end rounded-card border border-line-strong bg-surface-1 p-2 text-label text-ink-faint shadow-modal">modal</div>
          <div class="flex size-24 items-end rounded-card bg-primary p-2 text-label text-ink-inverse shadow-glow">glow</div>
        </div>
      </div>
    </section>

    <section class="mt-14">
      <p class="eyebrow">OpButton</p>
      <div class="mt-4 flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-1 p-5">
        <OpButton icon="zap">Primary</OpButton>
        <OpButton variant="secondary" icon-right="arrow-right">Secondary</OpButton>
        <OpButton variant="ghost">Ghost</OpButton>
        <OpButton variant="accent">Accent</OpButton>
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

    <section class="mt-10">
      <p class="eyebrow">OpCheckbox · OpRadio · FormRenderer</p>
      <div class="mt-4 flex flex-col gap-6 rounded-card border border-line bg-surface-1 p-5">
        <div class="flex flex-wrap items-center gap-6">
          <OpCheckbox v-model="checked" label="I agree" />
          <OpRadio v-model="radio" value="a" label="Option A" name="demo" />
          <OpRadio v-model="radio" value="b" label="Option B" name="demo" />
        </div>
        <FormRenderer v-model="formValues" :schema="formSchema" />
        <pre class="overflow-x-auto font-mono text-small text-ink-faint">{{ formValues }}</pre>
      </div>
    </section>

  </div>
</template>
