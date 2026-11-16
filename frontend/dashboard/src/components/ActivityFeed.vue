<script setup>
// Audit trail rows grouped by day: who did what, from where, and (on demand) what changed.
// Used by the Activity page (whole account) and anywhere a single record's history is shown.
import { reactive } from 'vue';
import OpIcon from '@ds/components/OpIcon.vue';
import { actorName, describe, fieldLabel, formatValue, groupByDay, isStaffActor, isSystem, nounOf, visibleChanges, whereText } from '@/helpers/Activity';
import { formatTime } from '@/helpers/Format';

const props = defineProps({
  rows: { type: Array, required: true },
  // { labels, groups, channels } as { id: name }, to show names instead of ids
  lookups: { type: Object, default: () => ({}) },
  // false on a record's own page: "changed this record" instead of repeating its name
  showRecord: { type: Boolean, default: true },
});

const open = reactive({});
const initials = (r) => actorName(r).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const sentence = (r) => {
  const d = describe(r);
  if (!props.showRecord && d.noun) return { ...d, noun: `this ${nounOf(r)}`, label: '' };
  return d;
};
const toggleText = (r) => {
  const n = visibleChanges(r).length;
  if (r.action === 'created' || r.action === 'deleted') return open[r.id] ? 'Hide settings' : 'Show settings';
  return open[r.id] ? 'Hide' : `${n} change${n === 1 ? '' : 's'}`;
};
// Pause, resume, verify and plan changes say it all in the headline.
const showToggle = (r) => visibleChanges(r).length > 0 && !['signed_in', 'plan_changed', 'paused', 'resumed', 'verified'].includes(r.action);
</script>

<template>
  <div>
    <section v-for="g in groupByDay(rows)" :key="g.key" class="mt-6 first:mt-0">
      <h3 class="font-mono text-label uppercase text-ink-faint">{{ g.title }}</h3>
      <ul class="mt-2 overflow-hidden rounded-sheet border border-line bg-surface-2">
        <li v-for="r in g.rows" :key="r.id" class="border-b border-line-faint px-4 py-3 last:border-b-0">
          <div class="flex items-start gap-3">
            <span
              :class="['mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]', isSystem(r) ? 'border-line bg-surface-3 text-ink-faint' : 'border-cyan/40 bg-cyan/10 text-cyan']"
              :title="isSystem(r) ? 'Done automatically by Paprcraft' : actorName(r)"
              aria-hidden="true"
            >
              <OpIcon v-if="isSystem(r)" name="refresh" :size="13" />
              <template v-else>{{ initials(r) }}</template>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-body text-ink-muted">
                <span class="font-medium text-ink">{{ actorName(r) }}</span>{{ ` ${sentence(r).verb}` }}{{ sentence(r).noun ? ` ${sentence(r).noun}` : '' }}{{ sentence(r).label ? ' ' : '' }}<span v-if="sentence(r).label" class="font-medium text-ink">{{ sentence(r).label }}</span>
              </p>
              <p class="mt-0.5 text-small text-ink-faint">
                <span v-if="isSystem(r)">Done automatically by Paprcraft</span>
                <template v-else>
                  <span v-if="isStaffActor(r)" class="mr-1.5 rounded-full border border-violet/40 px-1.5 font-mono text-[10px] uppercase text-violet">Staff</span>
                  <span>{{ whereText(r.actor) || (isStaffActor(r) ? 'Changed by the Paprcraft team' : '') }}</span>
                </template>
              </p>
              <button v-if="showToggle(r)" type="button" class="mt-1.5 inline-flex items-center gap-1 text-small text-cyan hover:underline" :aria-expanded="!!open[r.id]" @click="open[r.id] = !open[r.id]">
                {{ toggleText(r) }}
                <OpIcon name="chevron-down" :size="12" :class="open[r.id] && 'rotate-180'" />
              </button>
              <dl v-if="open[r.id]" class="mt-2 grid gap-x-4 gap-y-1.5 rounded-control border border-line-soft bg-surface-1 px-3 py-2.5 text-small sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
                <template v-for="c in visibleChanges(r)" :key="c.field">
                  <dt class="text-ink-faint">{{ fieldLabel(c.field) }}</dt>
                  <dd class="min-w-0 break-words text-ink-muted">
                    <template v-if="r.action === 'created'">{{ formatValue(c.field, c.to, lookups) }}</template>
                    <template v-else-if="r.action === 'deleted'">{{ formatValue(c.field, c.from, lookups) }}</template>
                    <template v-else>
                      <span class="text-ink-faint line-through decoration-ink-faint/50">{{ formatValue(c.field, c.from, lookups) }}</span>
                      <span class="px-1.5 text-ink-faint" aria-label="changed to">→</span>
                      <span class="text-ink">{{ formatValue(c.field, c.to, lookups) }}</span>
                    </template>
                  </dd>
                </template>
              </dl>
            </div>
            <time :datetime="r.createdAt" :title="new Date(r.createdAt).toLocaleString()" class="shrink-0 font-mono text-small text-ink-faint">{{ formatTime(r.createdAt) }}</time>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
