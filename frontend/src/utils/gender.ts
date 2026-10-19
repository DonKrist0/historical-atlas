import type { Gender, Person } from '../data/people.ts'
import type { FamilyRole } from './familyForm.ts'

export const genderLabels: Record<Gender, string> = { male: 'Мужской', female: 'Женский', unknown: 'Не указан' }

const maleRoles = new Set(['сын', 'брат', 'отец', 'муж', 'супруг', 'дед', 'внук', 'дядя', 'племянник', 'двоюродный брат'])
const femaleRoles = new Set(['дочь', 'сестра', 'мать', 'жена', 'супруга', 'бабушка', 'внучка', 'тетя', 'племянница', 'двоюродная сестра'])
const normalize = (role: string) => role.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е')

export function roleGender (role: string): Gender {
  const normalized = normalize(role)
  return maleRoles.has(normalized) ? 'male' : (femaleRoles.has(normalized) ? 'female' : 'unknown')
}

export function oppositeGender (gender: Gender): Gender {
  return gender === 'male' ? 'female' : (gender === 'female' ? 'male' : 'unknown')
}

export function familyTargetGender (slot: FamilyRole, gender: Gender): Gender {
  return slot === 'mother' ? 'female' : (slot === 'father' ? 'male' : oppositeGender(gender))
}

export function familySourceRole (slot: FamilyRole, gender: Gender): string {
  const roles = slot === 'spouse'
    ? { male: 'Муж', female: 'Жена', unknown: 'Супруг' }
    : { male: 'Сын', female: 'Дочь', unknown: 'Ребёнок' }
  return roles[gender]
}

export function relationTargetGender (role: string, sourceGender: Gender): Gender {
  // Roles describe the source person. A daughter can choose a parent of either gender.
  if (['муж', 'жена', 'супруг', 'супруга'].includes(normalize(role))) {
    return oppositeGender(roleGender(role) === 'unknown' ? sourceGender : roleGender(role))
  }
  return 'unknown'
}

export function filterPeopleByGender (people: Person[], expected: Gender, includeUnknown: boolean, selectedId = ''): Person[] {
  return people.filter(person => person.id === selectedId || (!person.gender || person.gender === 'unknown'
    ? includeUnknown
    : expected === 'unknown' || person.gender === expected))
}
