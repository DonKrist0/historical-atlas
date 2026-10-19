import type { PersonRelation } from '../data/people.ts'

export type FamilyRole = NonNullable<PersonRelation['familyRole']>
export const familySlots: { key: FamilyRole, label: string }[] = [
  { key: 'mother', label: 'Мать' }, { key: 'father', label: 'Отец' }, { key: 'spouse', label: 'Супруг / супруга' },
]

export function emptyFamily () {
  return Object.fromEntries(familySlots.map(({ key }) => [key, {
    personId: '', role: key === 'spouse' ? 'Супруг' : 'Ребёнок', familyRole: key,
  }])) as Record<FamilyRole, PersonRelation>
}

export function splitFamilyRelations (relations: PersonRelation[]) {
  const family = emptyFamily()
  const additional: PersonRelation[] = []
  for (const relation of relations) {
    const copy = { ...relation }
    const slot = copy.familyRole ?? (['муж', 'жена', 'супруг', 'супруга'].includes(copy.role.trim().toLocaleLowerCase('ru')) ? 'spouse' : undefined)
    if (slot && !family[slot].personId) {
      family[slot] = { ...copy, familyRole: slot }
    } else {
      additional.push(copy)
    }
  }
  return { family, additional }
}

export function combineFamilyRelations (family: Record<FamilyRole, PersonRelation>, additional: PersonRelation[]) {
  return [...familySlots.map(({ key }) => family[key]).filter(relation => relation.personId), ...additional].map(relation => ({ ...relation }))
}

// Only suggest established forms; names outside these rules stay manual.
export function patronymicSuggestions (firstName: string): string[] {
  const name = firstName.trim()
  const exceptions: Record<string, [string, string]> = {
    Павел: ['Павлович', 'Павловна'], Пётр: ['Петрович', 'Петровна'], Петр: ['Петрович', 'Петровна'],
    Илья: ['Ильич', 'Ильинична'], Яков: ['Яковлевич', 'Яковлевна'], Лев: ['Львович', 'Львовна'],
    Никита: ['Никитич', 'Никитична'], Савва: ['Саввич', 'Саввична'], Фома: ['Фомич', 'Фоминична'],
    Лука: ['Лукич', 'Лукинична'], Кузьма: ['Кузьмич', 'Кузьминична'],
    Юрий: ['Юрьевич', 'Юрьевна'], Василий: ['Васильевич', 'Васильевна'],
    Дмитрий: ['Дмитриевич', 'Дмитриевна'], Григорий: ['Григорьевич', 'Григорьевна'],
    Виталий: ['Витальевич', 'Витальевна'], Анатолий: ['Анатольевич', 'Анатольевна'],
    Игорь: ['Игоревич', 'Игоревна'], Игор: ['Игоревич', 'Игоревна'],
  }
  const canonical = name.charAt(0).toLocaleUpperCase('ru') + name.slice(1).toLocaleLowerCase('ru')
  if (exceptions[canonical]) {
    return exceptions[canonical]
  }
  if (/^\p{Script=Cyrillic}+ей$/u.test(canonical)) {
    return [`${canonical.slice(0, -1)}евич`, `${canonical.slice(0, -1)}евна`]
  }
  if (/^\p{Script=Cyrillic}+[бвгджзклмнпрстфхцчшщ]$/u.test(canonical)) {
    return [`${canonical}ович`, `${canonical}овна`]
  }
  return []
}
