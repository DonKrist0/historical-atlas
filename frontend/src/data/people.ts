export type GroupId = 'rulers' | 'family' | 'close' | 'contemporaries' | 'clergy'
export type Gender = 'male' | 'female' | 'unknown'

export interface CountryRole {
  country: string
  group: GroupId
}

export interface PersonRelation {
  personId: string
  role: string
  familyRole?: 'mother' | 'father' | 'spouse'
  startYear?: number
  endYear?: number
}

export interface Person {
  id: string
  name: string
  firstName?: string
  lastName?: string
  patronymic?: string
  gender?: Gender
  country?: string
  countryRoles?: CountryRole[]
  region?: string
  dynasty?: string
  start: number
  end: number
  group: GroupId
  note: string
  biography?: string
  sources?: string
  before?: boolean
  // Направление: эта персона приходится role человеку с указанным personId.
  relations?: PersonRelation[]
  // Старый формат одной связи: читается для совместимости с сохранёнными данными.
  relation?: PersonRelation
}

export const groups: { id: GroupId, label: string, color: string, icon: string }[] = [
  { id: 'rulers', label: 'Правители', color: '#c6a568', icon: 'mdi-crown-outline' },
  { id: 'family', label: 'Родня', color: '#a599c2', icon: 'mdi-family-tree' },
  { id: 'close', label: 'Ближний круг', color: '#779d8e', icon: 'mdi-shield-outline' },
  { id: 'contemporaries', label: 'Современники', color: '#7b9cb8', icon: 'mdi-feather' },
  { id: 'clergy', label: 'Духовенство', color: '#c18e78', icon: 'mdi-cross' },
]
