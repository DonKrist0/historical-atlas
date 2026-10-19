export function centuryLabel (century: number): string {
  const numerals: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let label = ''
  for (const [value, symbol] of numerals) {
    while (century >= value) {
      label += symbol
      century -= value
    }
  }
  return label
}

export function collectionPeriod (people: { start: number, end: number }[]) {
  if (people.length === 0) {
    return { start: null, end: null, label: 'Даты не указаны', centuries: [] }
  }
  const start = Math.min(...people.map(person => person.start))
  const end = Math.max(...people.map(person => person.end))
  const firstCentury = Math.ceil(start / 100)
  const lastCentury = Math.ceil(end / 100)
  const centuries = Array.from({ length: lastCentury - firstCentury + 1 }, (_, index) => {
    const century = firstCentury + index
    return { start: (century - 1) * 100 + 1, end: century * 100, label: `${centuryLabel(century)} век` }
  }).filter(period => people.some(person => person.start <= period.end && person.end >= period.start))
  const label = firstCentury === lastCentury
    ? `${centuryLabel(firstCentury)} век`
    : `${centuryLabel(firstCentury)}–${centuryLabel(lastCentury)} века`
  return { start, end, label, centuries }
}
