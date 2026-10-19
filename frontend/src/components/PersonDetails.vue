<script setup lang="ts">
  import type { Person } from '../data/people'
  import { computed, ref, watch } from 'vue'
  import { groups } from '../data/people'
  import { relationPeriod } from '../utils/relationPeriod'

  const props = defineProps<{ person: Person, people: Person[] }>()
  const emit = defineEmits<{ close: [], select: [person: Person] }>()
  const article = ref<HTMLElement | null>(null)
  watch(() => props.person.id, () => article.value?.scrollTo({ top: 0 }), { flush: 'post' })
  const group = computed(() => groups.find(group => group.id === props.person.group))
  const facts = computed(() => [
    { label: 'Страна', value: props.person.country, icon: 'mdi-earth' },
    { label: 'Регион', value: props.person.region, icon: 'mdi-map-marker-outline' },
    { label: 'Династия', value: props.person.dynasty, icon: 'mdi-family-tree' },
  ].filter(fact => fact.value?.trim()))
  const outgoing = computed(() => (props.person.relations ?? []).map(relation => ({
    ...relation, target: props.people.find(person => person.id === relation.personId),
  })))
  const incoming = computed(() => props.people.flatMap(person =>
    (person.relations ?? []).filter(relation => relation.personId === props.person.id).map(relation => ({ ...relation, source: person }))))
</script>

<template>
  <article ref="article" aria-labelledby="person-details-title" class="person-details" :style="{ '--person-accent': group?.color ?? '#c6a568' }">
    <header class="details-header">
      <div class="details-topline">
        <span class="details-eyebrow">ЛЮДИ ИСТОРИИ</span>
        <button aria-label="Закрыть карточку" class="details-close" @click="emit('close')"><i aria-hidden="true" class="mdi mdi-close" /></button>
      </div>

      <span v-if="group" class="details-group"><i aria-hidden="true" :class="`mdi ${group.icon}`" />{{ group.label }}</span>
      <h2 id="person-details-title">{{ person.name }}</h2>
      <p v-if="person.note.trim()" class="details-note">{{ person.note }}</p>
      <div class="details-dates"><i aria-hidden="true" class="mdi mdi-calendar-range-outline" /><span>{{ person.before ? 'до ' : '' }}{{ person.start }} <span class="date-divider">—</span> {{ person.end }} <small>гг.</small></span></div>
      <p v-if="person.before" class="details-date-note">Точный год начала периода неизвестен.</p>
    </header>

    <div class="details-body">
      <dl v-if="facts.length > 0" class="details-facts">
        <div v-for="fact in facts" :key="fact.label">
          <dt><i aria-hidden="true" :class="`mdi ${fact.icon}`" />{{ fact.label }}</dt>
          <dd>{{ fact.value }}</dd>
        </div>
      </dl>

      <section class="details-section">
        <h3><span>01</span>Биография</h3>
        <p v-if="person.biography?.trim()" class="details-biography">{{ person.biography }}</p>
        <p v-else class="details-empty">Биографическая справка пока не добавлена.</p>
        <dl v-if="person.sources?.trim()" class="details-sources"><dt><i aria-hidden="true" class="mdi mdi-book-open-page-variant-outline" />Источники</dt><dd>{{ person.sources }}</dd></dl>
      </section>

      <section class="details-section">
        <h3><span>02</span>Связи с персонами <small>{{ outgoing.length + incoming.length }}</small></h3>
        <p v-if="outgoing.length === 0 && incoming.length === 0" class="details-empty">Связи с другими персонами пока не указаны.</p>

        <div v-else class="details-relations">
          <div v-for="(relation, index) in outgoing" :key="`out-${index}`" class="details-relation">
            <p><span>{{ person.name }}</span> — <strong>{{ relation.role }}</strong> →</p>
            <button v-if="relation.target" class="details-person-link" @click="emit('select', relation.target)">{{ relation.target.name }}<i aria-hidden="true" class="mdi mdi-arrow-top-right" /></button>
            <span v-else class="details-empty">Персона недоступна</span>
            <small>{{ relationPeriod(relation) }}</small>
          </div>

          <div v-for="(relation, index) in incoming" :key="`in-${index}`" class="details-relation">
            <button class="details-person-link" @click="emit('select', relation.source)">{{ relation.source.name }}<i aria-hidden="true" class="mdi mdi-arrow-top-right" /></button>
            <p><strong>{{ relation.role }}</strong> → <span>{{ person.name }}</span></p>
            <small>{{ relationPeriod(relation) }}</small>
          </div>
        </div>
      </section>
    </div>

    <footer class="details-footer"><span>ХРОНИКА <span>✧</span> ИСТОРИЧЕСКИЙ АТЛАС</span><button @click="emit('close')">Закрыть</button></footer>
  </article>
</template>

<style scoped lang="scss">
  .person-details { max-height: calc(100dvh - 48px); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #596448 #1c2119; background: #1c2119; border: 1px solid #465039; border-radius: 12px; color: #dce2d1; overflow-wrap: anywhere; }
  .details-header { padding: 25px 34px 30px; border-top: 3px solid var(--person-accent); background: radial-gradient(ellipse at top left, #353b29 0, transparent 75%); }
  .details-topline { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 26px; }
  .details-eyebrow { font-size: 9px; letter-spacing: 2.5px; color: #969e89; }
  .details-close { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid #48503c; border-radius: 50%; color: #b6bea9; font-size: 20px; }
  .details-close:hover { background: #39412e; color: #f1eee4; }
  .details-group { display: inline-flex; align-items: center; gap: 7px; padding: 5px 10px; border: 1px solid color-mix(in srgb, var(--person-accent) 40%, transparent); border-radius: 20px; color: var(--person-accent); font-size: 11px; }
  h2 { font: 400 clamp(28px, 5vw, 40px)/1.2 Georgia, serif; color: #f0eee3; margin-top: 17px; text-wrap: balance; }
  .details-note { color: #b5bea6; font-size: 14px; line-height: 1.65; margin-top: 12px; white-space: pre-wrap; }
  .details-dates { display: flex; align-items: center; gap: 10px; margin-top: 23px; color: #d2b780; font-size: 19px; font-variant-numeric: tabular-nums; }
  .details-dates > .mdi { color: #839175; font-size: 20px; }
  .date-divider { color: #78846b; margin: 0 6px; }
  .details-dates small { font-size: 12px; color: #9aa68b; }
  .details-date-note { font-size: 11px; line-height: 1.6; color: #96a087; margin-top: 8px; }
  .details-body { padding: 0 34px 30px; }
  .details-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; padding: 24px 0; border-top: 1px solid #38432e; }
  dt { display: flex; align-items: center; gap: 6px; color: #8f9b81; font-size: 10px; margin-bottom: 8px; }
  dd { margin: 0; font-size: 13px; line-height: 1.6; color: #d4dcc8; }
  .details-section { padding-top: 25px; margin-top: 4px; border-top: 1px solid #38432e; }
  .details-section + .details-section { margin-top: 28px; }
  h3 { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; font-size: 14px; font-weight: 500; }
  h3 > span { color: #8a927a; font: 10px 'Roboto Mono', monospace; }
  h3 > small { margin-left: auto; color: var(--person-accent); font: 12px 'Roboto Mono', monospace; }
  .details-biography { font-size: 14px; line-height: 1.9; white-space: pre-wrap; color: #c3ccb5; }
  .details-sources { margin-top: 20px; padding-left: 14px; border-left: 2px solid var(--person-accent); }
  .details-sources dd { font-size: 12px; line-height: 1.8; white-space: pre-wrap; }
  .details-empty { color: #8f9b81; font-size: 12px; line-height: 1.8; }
  .details-relations { display: grid; gap: 10px; }
  .details-relation { padding: 16px 18px; border: 1px solid #39432f; border-radius: 6px; background: #181e15; }
  .details-relation p { font-size: 12px; line-height: 1.8; color: #a1ad91; }
  .details-relation strong { color: #c8d1ba; font-weight: 500; }
  .details-person-link { display: inline-flex; align-items: center; gap: 8px; max-width: 100%; padding: 3px 0; text-align: left; color: #d2b780; font-size: 14px; line-height: 1.6; }
  .details-person-link:hover { text-decoration: underline; }
  .details-person-link .mdi { font-size: 14px; flex-shrink: 0; }
  .details-relation > small { display: block; margin-top: 7px; color: #8b977e; font-size: 10px; }
  .details-footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 18px 34px; border-top: 1px solid #38432e; }
  .details-footer > span { font-size: 8px; letter-spacing: 1.4px; color: #8c957e; }
  .details-footer > span > span { margin: 0 6px; color: #c6a568; }
  .details-footer > button { padding: 9px 16px; border: 1px solid #555a42; border-radius: 4px; color: #d2b780; font-size: 12px; }
  button:focus-visible { outline: 2px solid #d4b77e; outline-offset: 3px; }
  @media (max-width: 520px) {
    .details-header { padding: 18px 22px 24px; }
    .details-body { padding: 0 22px 24px; }
    .details-facts { grid-template-columns: 1fr; gap: 16px; }
    .details-footer { padding: 16px 22px; }
    .details-footer > span { font-size: 7px; letter-spacing: .6px; }
  }
</style>
