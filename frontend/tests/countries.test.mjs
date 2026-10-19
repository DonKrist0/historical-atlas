import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSnapshot } from '../src/data/snapshot.ts'
import { countries, countryKey, defaultCountry, filterByCountry, roleForCountry, scopeRelations } from '../src/utils/countries.ts'
import { buildRelationsGraph } from '../src/utils/graph.ts'

const person = (id, country, extra = {}) => ({ id, country, name: id, start: 1350, end: 1400, group: 'rulers', note: '', ...extra })

test('country perspective projects explicit roles, including multiple countries ruled by the same person', () => {
  const people = [person('dmitry', 'Русь / Россия'), person('vitovt', 'Литва', { countryRoles: [{ country: 'Русь / Россия', group: 'contemporaries' }, { country: 'Польша', group: 'rulers' }] }), person('other', 'Франция')]
  const russian = filterByCountry(people, 'русь / россия')
  assert.deepEqual(russian.map(p => [p.id, p.group]), [['dmitry', 'rulers'], ['vitovt', 'contemporaries']])
  assert.equal(filterByCountry(people, 'литва')[0].group, 'rulers')
  assert.equal(filterByCountry(people, 'польша')[0].group, 'rulers')
  assert.equal(people[1].group, 'rulers', 'projection must not mutate the saved primary role')
  assert.equal(roleForCountry(people[0], 'франция'), undefined, 'foreign people are not classified automatically')
  assert.deepEqual(filterByCountry(people, '*'), [], 'there is no all-countries perspective')
})

test('country choices include secondary assignments, normalize names and count people once', () => {
  const people = [person('a', ' Русь ', { countryRoles: [{ country: 'Литва', group: 'contemporaries' }] }), person('b', 'РУСЬ'), person('c', 'Литва'), person('d')]
  assert.equal(countryKey(' Великое  княжество '), 'великое княжество')
  assert.deepEqual(countries(people), [
    { value: 'литва', label: 'Литва', count: 2 },
    { value: 'русь', label: 'Русь', count: 2 },
    { value: '', label: 'Страна не указана', count: 1 },
  ])
  assert.deepEqual(filterByCountry(people, '').map(p => p.id), ['d'])
})

test('a concrete default is selected and invalid or removed saved choices recover', () => {
  const people = [person('a', 'Литва'), person('b', 'Русь / Россия')]
  assert.equal(defaultCountry(people), 'русь / россия')
  assert.equal(defaultCountry(people, 'литва'), 'литва')
  assert.equal(defaultCountry(people, '*'), 'русь / россия')
  assert.equal(defaultCountry([people[0]], 'русь / россия'), 'литва')
  assert.equal(defaultCountry([]), '')
})

test('graph hides excluded links without altering editable records or hiding broken link diagnostics', () => {
  const people = [person('a', 'Русь', { relations: [{ personId: 'b', role: 'Брат' }, { personId: 'c', role: 'Друг' }, { personId: 'missing', role: 'Друг' }] }), person('b', 'РУСЬ'), person('c', 'Франция')]
  const scoped = scopeRelations(filterByCountry(people, 'русь'), people)
  assert.deepEqual(scoped[0].relations.map(r => r.personId), ['b', 'missing'])
  assert.equal(people[0].relations.length, 3)
})

test('snapshots round-trip country roles and reject invalid, duplicate or primary-country overrides', () => {
  const base = person('vitovt', 'Литва')
  const record = { ...base, countryRoles: [{ country: 'Русь / Россия', group: 'contemporaries' }] }
  assert.deepEqual(parseSnapshot([record]), [record])
  assert.deepEqual(parseSnapshot([base]), [base])
  for (const countryRoles of [null, [{}], [{ country: '', group: 'rulers' }], [{ country: 'Русь', group: 'invalid' }], [{ country: ' ЛИТВА ', group: 'rulers' }], [{ country: 'Русь', group: 'rulers' }, { country: ' русь ', group: 'family' }]]) {
    assert.throws(() => parseSnapshot([{ ...base, countryRoles }]))
  }
})

test('context relations respect explicit perspective roles while keeping factual home countries intact', () => {
  const people = [person('ruler', 'Русь', { region: 'Москва' }), person('ally', 'Литва', { region: 'Москва', countryRoles: [{ country: 'Русь', group: 'close' }] })]
  const scoped = filterByCountry(people, 'русь')
  assert.equal(scoped[1].country, 'Литва')
  assert.equal(buildRelationsGraph(scoped, 'ruler', { sameCountryPerspective: true }).contextCount, 1)
  assert.equal(buildRelationsGraph(scoped, 'ruler').contextCount, 0)
})
