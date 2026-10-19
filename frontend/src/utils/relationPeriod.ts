import type { PersonRelation } from '../data/people'

export function relationPeriod (relation: Pick<PersonRelation, 'startYear' | 'endYear'>): string {
  if (relation.startYear !== undefined && relation.endYear !== undefined) {
    return `${relation.startYear}–${relation.endYear}`
  }
  if (relation.startYear !== undefined) {
    return `с ${relation.startYear}`
  }
  if (relation.endYear !== undefined) {
    return `до ${relation.endYear}`
  }
  return 'период не указан'
}
