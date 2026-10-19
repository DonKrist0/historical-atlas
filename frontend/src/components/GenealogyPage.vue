<script setup lang="ts">
  import type { Person } from '../data/people'
  import { computed, ref, watch } from 'vue'
  import { genealogyDynasties, genealogyPeople } from '../utils/genealogy'
  import RelationsGraph from './RelationsGraph.vue'

  const props = defineProps<{ people: Person[], canEdit?: boolean }>()
  const emit = defineEmits<{ edit: [person: Person] }>()
  const dynasty = ref('all')
  const includeRelatives = ref(true)
  const dynasties = computed(() => genealogyDynasties(props.people))
  const hasUnassigned = computed(() => props.people.some(person => !person.dynasty?.trim()))
  const shown = computed(() => genealogyPeople(props.people, dynasty.value, includeRelatives.value))
  watch(dynasties, options => {
    if (dynasty.value.startsWith('dynasty:') && !options.some(option => option.id === dynasty.value)) dynasty.value = 'all'
  })

  function editOriginal (person: Person) {
    const original = props.people.find(item => item.id === person.id)
    if (original) emit('edit', original)
  }
</script>

<template>
  <RelationsGraph :can-edit="canEdit" genealogy :people="shown" @edit="editOriginal">
    <template #filters>
      <div class="genealogy-filters">
        <label class="genealogy-select">Род / династия<select v-model="dynasty" aria-label="Род / династия"><option value="all">Все роды</option><option v-for="option in dynasties" :key="option.id" :value="option.id">{{ option.name }} · {{ option.count }}</option><option v-if="hasUnassigned" value="unassigned">Род не указан</option></select></label>
        <label v-if="dynasty !== 'all'" class="genealogy-relatives"><input v-model="includeRelatives" type="checkbox">Ближайшие родственники вне рода</label>
        <p>{{ dynasty === 'all' ? 'Все указанные роды и персоны с родственными связями.' : includeRelatives ? 'Члены выбранного рода и их непосредственные родственники, включая супругов.' : 'Только персоны выбранного рода.' }} Служба, дружба и совпадения лет здесь не показаны.</p>
      </div>
    </template>
  </RelationsGraph>
</template>

<style scoped>
  .genealogy-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 20px; padding: 10px 12px; border: 1px solid #394330; border-radius: 8px; background: #1c2119; flex-shrink: 0; }
  .genealogy-select { display: flex; align-items: center; gap: 12px; color: #b6c0a5; font-size: 11px; }
  .genealogy-select select { width: min(360px, 42vw); padding: 9px; border: 1px solid #4a533a; border-radius: 4px; background: #131910; color: #dddcca; font-size: 12px; }
  .genealogy-relatives { display: flex; gap: 8px; align-items: center; color: #b6c0a5; font-size: 11px; }
  .genealogy-relatives input { accent-color: #cbb17b; }
  .genealogy-filters p { flex-basis: 100%; margin: 0; color: #89977c; font-size: 11px; line-height: 1.5; }
  @media (max-width: 650px) { .genealogy-select { width: 100%; }.genealogy-select select { flex: 1; min-width: 0; width: 0; }.genealogy-filters { gap: 8px; }.genealogy-filters p { font-size: 10px; } }
</style>
