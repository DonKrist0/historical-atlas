import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSnapshot } from '../src/data/snapshot.ts'
import { combineFamilyRelations, emptyFamily, patronymicSuggestions, splitFamilyRelations } from '../src/utils/familyForm.ts'

test('family form round-trip preserves roles, dates and all additional relations', () => {
  const original = [
    { personId: 'father', role: 'Дочь', familyRole: 'father' },
    { personId: 'mother', role: 'Ребёнок', familyRole: 'mother' },
    { personId: 'spouse', role: 'Жена', startYear: 1380, endYear: 1390 },
    { personId: 'sibling', role: 'Брат' },
    { personId: 'second-spouse', role: 'Жена', startYear: 1400 },
    { personId: 'unknown-parent', role: 'Сын' },
  ]
  const before = structuredClone(original)
  const { family, additional } = splitFamilyRelations(original)
  assert.equal(family.father.personId, 'father')
  assert.equal(family.mother.personId, 'mother')
  assert.equal(family.spouse.startYear, 1380)
  assert.equal(family.spouse.role, 'Жена')
  assert.deepEqual(additional.map(link => link.personId), ['sibling', 'second-spouse', 'unknown-parent'])
  const saved = combineFamilyRelations(family, additional)
  assert.equal(saved.length, original.length)
  assert.equal(saved.find(link => link.personId === 'spouse').familyRole, 'spouse')
  assert.deepEqual(original, before)
  assert.equal(combineFamilyRelations(emptyFamily(), []).length, 0)
  family.father.personId = ''
  assert.ok(!combineFamilyRelations(family, additional).some(link => link.personId === 'father'))
})

test('patronymic suggestions handle regular names, exceptions and unsupported names', () => {
  assert.deepEqual(patronymicSuggestions('Иван'), ['Иванович', 'Ивановна'])
  assert.deepEqual(patronymicSuggestions('Дмитрий'), ['Дмитриевич', 'Дмитриевна'])
  assert.deepEqual(patronymicSuggestions('Сергей'), ['Сергеевич', 'Сергеевна'])
  assert.deepEqual(patronymicSuggestions('Илья'), ['Ильич', 'Ильинична'])
  assert.deepEqual(patronymicSuggestions('  пётр  '), ['Петрович', 'Петровна'])
  for (const name of ['', 'John', 'Иван Калита', 'Неизвестно']) {
    assert.deepEqual(patronymicSuggestions(name), [])
  }
})

test('static snapshots retain family roles and reject unknown family slots', () => {
  const makePerson = (id, relations = []) => ({ id, name: id, start: 1300, end: 1400, group: 'family', note: '', relations })
  const snapshot = [makePerson('child', [{ personId: 'father', role: 'Ребёнок', familyRole: 'father' }]), makePerson('father')]
  assert.equal(parseSnapshot(snapshot)[0].relations[0].familyRole, 'father')
  snapshot[0].relations[0].familyRole = 'unknown'
  assert.throws(() => parseSnapshot(snapshot))
})
