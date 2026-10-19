import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSnapshot } from '../src/data/snapshot.ts'
import { familySourceRole, familyTargetGender, filterPeopleByGender, relationTargetGender, roleGender } from '../src/utils/gender.ts'

test('family fields filter mothers, fathers and spouses and serialize source roles', () => {
  assert.equal(familyTargetGender('mother', 'unknown'), 'female')
  assert.equal(familyTargetGender('father', 'female'), 'male')
  assert.equal(familyTargetGender('spouse', 'male'), 'female')
  assert.equal(familyTargetGender('spouse', 'female'), 'male')
  assert.equal(familyTargetGender('spouse', 'unknown'), 'unknown')
  assert.equal(familySourceRole('mother', 'male'), 'Сын')
  assert.equal(familySourceRole('father', 'female'), 'Дочь')
  assert.equal(familySourceRole('father', 'unknown'), 'Ребёнок')
  assert.equal(familySourceRole('spouse', 'female'), 'Жена')
})

test('additional role filters respect relation direction instead of filtering parents as daughters', () => {
  assert.equal(relationTargetGender('Жена', 'female'), 'male')
  assert.equal(relationTargetGender('Муж', 'male'), 'female')
  assert.equal(relationTargetGender('Супруг', 'unknown'), 'female')
  for (const role of ['Дочь', 'Сын', 'Отец', 'Мать', 'Брат', 'Сестра', 'Друг']) {
    assert.equal(relationTargetGender(role, 'male'), 'unknown')
  }
  assert.equal(roleGender('Тётя'), 'female')
  assert.equal(roleGender('Дочь'), 'female')
  assert.equal(roleGender('Отец'), 'male')
  assert.equal(roleGender('Советник'), 'unknown')
})

test('unknown gender is optional in searches; a selected record is never silently dropped', () => {
  const people = [{ id: 'm', gender: 'male' }, { id: 'f', gender: 'female' }, { id: 'u', gender: 'unknown' }, { id: 'old' }]
  assert.deepEqual(filterPeopleByGender(people, 'female', false).map(p => p.id), ['f'])
  assert.deepEqual(filterPeopleByGender(people, 'female', true).map(p => p.id), ['f', 'u', 'old'])
  assert.deepEqual(filterPeopleByGender(people, 'female', false, 'm').map(p => p.id), ['m', 'f'])
  assert.equal(filterPeopleByGender(people, 'unknown', false).length, 2)
  assert.equal(filterPeopleByGender(people, 'unknown', true).length, 4)
})

test('snapshots accept old records and preserve valid gender values', () => {
  const person = { id: 'p', name: 'Персона', start: 1800, end: 1850, group: 'family', note: '' }
  assert.deepEqual(parseSnapshot([person]), [person])
  assert.equal(parseSnapshot([{ ...person, gender: 'female' }])[0].gender, 'female')
  assert.throws(() => parseSnapshot([{ ...person, gender: 'invalid' }]))
})
