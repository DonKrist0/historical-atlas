<script setup lang="ts">
  import type { Person } from '../data/people'
  import { computed } from 'vue'
  import { countries, filterByCountry } from '../utils/countries'

  const props = defineProps<{ people: Person[] }>()
  const model = defineModel<string>({ required: true })
  const options = computed(() => countries(props.people))
  const count = computed(() => filterByCountry(props.people, model.value).length)
</script>

<template>
  <div class="country-filter">
    <i aria-hidden="true" class="mdi mdi-earth" />
    <label><span>Смотрим со стороны</span><select v-model="model" aria-label="Страна — точка зрения" :disabled="options.length === 0"><option v-if="options.length === 0" value="">Добавьте страну в карточке персоны</option><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }} · {{ option.count }}</option></select></label>
    <div aria-live="polite" class="country-filter-summary"><strong>{{ count }} персон</strong><span>Роли персон относительно выбранной страны</span></div>
  </div>
</template>

<style scoped>
  .country-filter { display: flex; flex-shrink: 0; align-items: center; gap: 20px; margin: 4px 0 18px; padding: 18px 22px; border: 1px solid #63583c; border-radius: 10px; background: linear-gradient(110deg, #c6a56812, #1c241b); }
  .country-filter > .mdi { color: #c6a568; font-size: 32px; }
  label { display: grid; flex: 1; max-width: 440px; min-width: 0; gap: 6px; }
  label > span { color: #b9b395; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
  select { width: 100%; padding: 10px 32px 10px 12px; border: 1px solid #655e43; border-radius: 5px; background: #171f17; color: #eee8d9; font-size: 17px; appearance: auto; cursor: pointer; }
  select:focus-visible, button:focus-visible { outline: 2px solid #c6a568; outline-offset: 3px; }
  .country-filter-summary { display: grid; gap: 6px; }
  strong { color: #e2d4b5; font-size: 14px; font-weight: 500; }
  .country-filter-summary > span { color: #9ca78f; font-size: 11px; line-height: 1.5; }
  button { margin-left: auto; color: #c6a568; font-size: 12px; white-space: nowrap; }
  @media (max-width: 720px) {
    .country-filter { flex-wrap: wrap; gap: 12px; padding: 14px; }
    label { max-width: none; flex-basis: calc(100% - 50px); }
    .country-filter-summary { padding-left: 44px; flex: 1; }
    .country-filter-summary > span { max-width: 220px; }
  }
</style>
