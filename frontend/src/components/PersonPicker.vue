<script setup lang="ts">
  import type { Person } from '../data/people'

  defineProps<{ people: Person[], label: string, disabled?: boolean, required?: boolean }>()
  const model = defineModel<string>({ required: true })
</script>

<template>
  <v-autocomplete
    :aria-label="label"
    class="person-picker"
    clearable
    :disabled="disabled"
    hide-details="auto"
    :item-title="person => `${person.name} (${person.start}–${person.end})`"
    item-value="id"
    :items="people"
    :label="label"
    :menu-props="{ maxHeight: 280 }"
    :model-value="model || null"
    no-data-text="Персона не найдена"
    placeholder="Начните вводить имя…"
    :rules="required ? [value => !!value || 'Выберите персону'] : []"
    variant="outlined"
    @update:model-value="model = $event ?? ''"
  />
</template>

<style scoped lang="scss">
  .person-picker { min-width: 0; }
  .person-picker :deep(.v-field) { background: #141a11; color: #b8c0ac; border-radius: 4px; }
  .person-picker :deep(.v-field__outline) { color: #647250; }
  .person-picker :deep(.v-field--focused .v-field__outline) { color: #c8ad75; }
  .person-picker :deep(.v-field input) { border: 0; background: transparent; padding: 0; font-size: 12px; }
  .person-picker :deep(.v-field__input) { min-height: 52px; font-size: 12px; }
  .person-picker :deep(.v-label) { font-size: 12px; }
</style>
