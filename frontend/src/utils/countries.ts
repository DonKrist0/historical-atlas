import type { Person } from '../data/people.ts'

export const NO_COUNTRY = ''

export function countryKey (country?: string): string {
  return (country ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru')
}

export function countries (people: Person[]) {
  const options = new Map<string, { value: string, label: string, count: number }>()
  for (const person of people) {
    const entries = [person.country ?? '', ...(person.countryRoles ?? []).map(role => role.country)]
    const seen = new Set<string>()
    for (const country of entries) {
      const value = countryKey(country)
      if (seen.has(value)) {
        continue
      }
      seen.add(value)
      const prior = options.get(value)
      if (prior) {
        prior.count++
      } else {
        options.set(value, { value, label: value ? country.trim().replace(/\s+/g, ' ') : 'Страна не указана', count: 1 })
      }
    }
  }
  return [...options.values()].sort((a, b) => a.value === '' ? 1 : (b.value === '' ? -1 : a.label.localeCompare(b.label, 'ru')))
}

export function roleForCountry (person: Person, country: string) {
  if (countryKey(person.country) === country) {
    return person.group
  }
  return person.countryRoles?.find(role => countryKey(role.country) === country)?.group
}

export function filterByCountry (people: Person[], country: string): Person[] {
  return people.flatMap(person => {
    const group = roleForCountry(person, country)
    return group ? [{ ...person, group }] : []
  })
}

export function defaultCountry (people: Person[], preferred?: string): string {
  const options = countries(people)
  if (preferred !== undefined && options.some(option => option.value === preferred)) {
    return preferred
  }
  return options.find(option => option.value === 'русь / россия')?.value
    ?? options.find(option => option.value !== '')?.value ?? NO_COUNTRY
}

// Hide links to intentionally excluded people, retaining diagnostics for genuinely missing IDs.
// The original records remain intact for details and editing, including cross-border families.
export function scopeRelations (people: Person[], collection: Person[]): Person[] {
  const visible = new Set(people.map(person => person.id))
  const all = new Set(collection.map(person => person.id))
  return people.map(person => ({
    ...person,
    relations: (person.relations ?? (person.relation ? [person.relation] : []))
      .filter(relation => visible.has(relation.personId) || !all.has(relation.personId)),
    relation: undefined,
  }))
}
