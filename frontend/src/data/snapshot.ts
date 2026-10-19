import type { Person, PersonRelation } from './people'

export function parseSnapshot (data: unknown): Person[] {
  const groupIds = new Set(['rulers', 'family', 'close', 'contemporaries', 'clergy'])
  if (!Array.isArray(data) || !data.every(person =>
    person && typeof person.id === 'string' && person.id.length > 0
    && typeof person.name === 'string' && person.name.trim().length > 0
    && Number.isInteger(person.start) && person.start >= 1
    && Number.isInteger(person.end) && person.end >= person.start && person.end <= 2100
    && groupIds.has(person.group)
    && (person.countryRoles === undefined || (Array.isArray(person.countryRoles)
      && person.countryRoles.length <= 100
      && person.countryRoles.every((role: { country: string, group: string }) => role
        && typeof role.country === 'string' && role.country.trim().length > 0
        && role.country.length <= 150 && groupIds.has(role.group))))
      && typeof person.note === 'string'
      && (person.gender === undefined || ['male', 'female', 'unknown'].includes(person.gender))
      && ['firstName', 'lastName', 'patronymic', 'country', 'region', 'dynasty', 'biography', 'sources']
        .every(field => person[field] === undefined || typeof person[field] === 'string')
        && (person.before === undefined || typeof person.before === 'boolean')
        && (person.relations === undefined || (Array.isArray(person.relations) && person.relations.every(
          (relation: PersonRelation) =>
            relation && typeof relation.personId === 'string' && typeof relation.role === 'string'
            && (relation.familyRole === undefined || ['mother', 'father', 'spouse'].includes(relation.familyRole))
            && [relation.startYear, relation.endYear].every(year => year === undefined || (Number.isInteger(year) && year >= 1 && year <= 2100)),
        ))))) {
    throw new Error('Некорректный файл коллекции. Обновите JSON и пересоберите сайт.')
  }
  const people = data as Person[]
  const countryKey = (country?: string) => (country ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru')
  if (people.some(person => {
    const countries = (person.countryRoles ?? []).map(role => countryKey(role.country))
    return new Set(countries).size !== countries.length || countries.includes(countryKey(person.country))
  })) {
    throw new Error('В JSON есть повторяющиеся роли для одной страны.')
  }
  const ids = new Set(people.map(person => person.id))
  if (ids.size !== people.length || people.some(person =>
    (person.relations ?? []).some(relation => !ids.has(relation.personId) || relation.personId === person.id))) {
    throw new Error('В JSON есть повторяющиеся ID или связи с отсутствующими персонами.')
  }
  return people
}
