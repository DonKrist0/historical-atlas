import type { Person, PersonRelation } from './people'

export function parseSnapshot (data: unknown): Person[] {
  const groupIds = new Set(['rulers', 'family', 'close', 'contemporaries', 'clergy'])
  if (!Array.isArray(data) || !data.every(person =>
    person && typeof person.id === 'string' && person.id.length > 0
    && typeof person.name === 'string' && person.name.trim().length > 0
    && Number.isInteger(person.start) && person.start >= 1
    && Number.isInteger(person.end) && person.end >= person.start && person.end <= 2100
    && groupIds.has(person.group)
    && typeof person.note === 'string'
    && ['firstName', 'lastName', 'patronymic', 'country', 'region', 'dynasty', 'biography', 'sources']
      .every(field => person[field] === undefined || typeof person[field] === 'string')
      && (person.before === undefined || typeof person.before === 'boolean')
      && (person.relations === undefined || (Array.isArray(person.relations) && person.relations.every(
        (relation: PersonRelation) =>
          relation && typeof relation.personId === 'string' && typeof relation.role === 'string'
          && [relation.startYear, relation.endYear].every(year => year === undefined || (Number.isInteger(year) && year >= 1 && year <= 2100)),
      ))))) {
    throw new Error('Некорректный файл коллекции. Обновите JSON и пересоберите сайт.')
  }
  const people = data as Person[]
  const ids = new Set(people.map(person => person.id))
  if (ids.size !== people.length || people.some(person =>
    (person.relations ?? []).some(relation => !ids.has(relation.personId) || relation.personId === person.id))) {
    throw new Error('В JSON есть повторяющиеся ID или связи с отсутствующими персонами.')
  }
  return people
}
