import type { Person } from '../data/people'
import { isKinshipRole, normalizeGraphText } from './graphRules.ts'

export function genealogyDynasties (people: Person[]) {
  const options = new Map<string, { id: string, name: string, count: number }>()
  for (const person of people) {
    const name = person.dynasty?.trim().replace(/\s+/g, ' ')
    if (!name) {
      continue
    }
    const id = `dynasty:${normalizeGraphText(name)}`
    const option = options.get(id) ?? { id, name, count: 0 }
    option.count++
    options.set(id, option)
  }
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export function genealogyPeople (people: Person[], dynasty = 'all', includeRelatives = true) {
  const family = people.map(person => ({ ...person, relations: (person.relations ?? (person.relation ? [person.relation] : [])).filter(relation => isKinshipRole(relation.role)) }))
  const existing = new Set(people.map(person => person.id))
  const linked = new Set(family.flatMap(person => person.relations.filter(relation => existing.has(relation.personId)).flatMap(relation => [person.id, relation.personId])))
  const members = new Set(people.filter(person => dynasty === 'all'
    ? !!person.dynasty?.trim() || linked.has(person.id)
    : (dynasty === 'unassigned' ? !person.dynasty?.trim() : `dynasty:${normalizeGraphText(person.dynasty)}` === dynasty)).map(person => person.id))
  const visible = new Set(members)
  if (includeRelatives && dynasty !== 'all') {
    // One hop from actual members: an added spouse must not pull in an unrelated whole dynasty.
    for (const person of family) {
      for (const relation of person.relations) {
        if (members.has(person.id) && existing.has(relation.personId)) {
          visible.add(relation.personId)
        }
        if (members.has(relation.personId)) {
          visible.add(person.id)
        }
      }
    }
  }
  return family.filter(person => visible.has(person.id)).map(person => ({ ...person, relations: person.relations.filter(relation => visible.has(relation.personId)) }))
}
