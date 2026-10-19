import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { loadStaticPeople } from '../src/api/staticPeople.ts'
import { parseSnapshot } from '../src/data/snapshot.ts'

const person = { id: 'one', name: 'Иван', start: 1380, end: 1450, group: 'family', note: '', sources: 'Летопись', biography: 'Биография', relations: [] }

test('snapshot loads from a project subdirectory without backend or credentials', async () => {
  const data = await loadStaticPeople('/historical-gantus/', async (url, options) => {
    assert.equal(url, '/historical-gantus/data/people.json')
    assert.equal(options.credentials, 'omit')
    assert.equal(options.headers, undefined)
    return Response.json([person])
  })
  assert.deepEqual(data, [person])
})

test('relative base works for both domain and repository Pages', async () => {
  await loadStaticPeople('./', async url => {
    assert.equal(new URL(url, 'https://example.github.io/atlas/#/people').pathname, '/atlas/data/people.json')
    assert.equal(new URL(url, 'https://example.github.io/#/people').pathname, '/data/people.json')
    return Response.json([])
  })
})

test('loading errors explain how to recover', async () => {
  await assert.rejects(loadStaticPeople('./', async () => new Response('', { status: 404 })), /404/)
  await assert.rejects(loadStaticPeople('./', async () => {
    throw new Error('offline')
  }), /подключение/)
  await assert.rejects(loadStaticPeople('./', async () => new Response('<html>404</html>')), /JSON/)
})

test('invalid snapshots fail instead of breaking the timeline or cards', () => {
  for (const data of [null, {}, [{}], [{ ...person, start: '1380' }], [{ ...person, note: null }], [{ ...person, biography: {} }], [{ ...person, relations: [null] }], [person, person], [{ ...person, relations: [{ personId: 'absent', role: 'Сын' }] }]]) {
    assert.throws(() => parseSnapshot(data))
  }
})

test('the published collection is valid, including source references and links', () => {
  const data = JSON.parse(readFileSync(new URL('../public/data/people.json', import.meta.url), 'utf8'))
  assert.deepEqual(parseSnapshot(data), data)
})
