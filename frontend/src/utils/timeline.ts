import type { Person } from '../data/people'

// Годы включают обе границы: периоды 1380–1400 и 1400–1420 пересекаются.
export function packTimelineColumns (people: Person[]): Person[][] {
  const columns: Person[][] = []
  const sorted = [...people].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id))

  for (const person of sorted) {
    const column = columns.find(items => items.at(-1)!.end < person.start)
    if (column) {
      column.push(person)
    } else {
      columns.push([person])
    }
  }

  return columns
}
