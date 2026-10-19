import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { genealogyDynasties, genealogyPeople } from '../src/utils/genealogy.ts'
import { buildRelationsGraph, firstRegionRoot, NODE_HEIGHT, NODE_WIDTH } from '../src/utils/graph.ts'
import { isKinshipRole } from '../src/utils/graphRules.ts'

const person = (id, options = {}) => ({ id, name: id, start: 1350, end: 1400, group: 'family', note: '', ...options })

test('genealogy lists recorded dynasties and only keeps explicit kinship including affinity', () => {
  const people = [
    person('root', { dynasty: ' Род А ', relations: [{ personId: 'son', role: 'Отец' }, { personId: 'friend', role: 'Друг' }] }),
    person('son', { dynasty: 'род а', relations: [{ personId: 'root', role: 'Сподвижник' }] }),
    person('friend', { group: 'close' }),
    person('in-law', { relations: [{ personId: 'root', role: 'Свояк' }] }),
    person('monk', { group: 'clergy' }),
  ]
  const original = structuredClone(people)
  assert.deepEqual(genealogyDynasties(people), [{ id: 'dynasty:род а', name: 'Род А', count: 2 }])
  const shown = genealogyPeople(people)
  assert.deepEqual(shown.map(p => p.id), ['root', 'son', 'in-law'])
  const graph = buildRelationsGraph(shown, 'root', { includeContext: false, grouped: false })
  assert.equal(graph.explicitCount, 2)
  assert.ok(graph.edges.every(edge => edge.records.every(record => isKinshipRole(record.role))))
  assert.equal(graph.contextCount, 0)
  assert.deepEqual(people, original)
})

test('genealogy includes incoming relatives one hop away and supports strict clan selection', () => {
  const people = [person('root', { dynasty: 'А' }),
    person('wife', { dynasty: 'Б', relation: { personId: 'root', role: 'Жена' } }),
    person('father-in-law', { dynasty: 'Б', relations: [{ personId: 'wife', role: 'Отец' }] }),
    person('child', { relations: [{ personId: 'root', role: 'Сын' }] })]
  assert.deepEqual(genealogyPeople(people, 'dynasty:а').map(p => p.id), ['root', 'wife', 'child'])
  const strict = genealogyPeople(people, 'dynasty:а', false)
  assert.deepEqual(strict.map(p => p.id), ['root'])
  assert.deepEqual(strict[0].relations, [])
  assert.deepEqual(genealogyPeople(people, 'unassigned', false).map(p => p.id), ['child'])
  assert.deepEqual(genealogyPeople(people, 'dynasty:missing'), [])
  assert.deepEqual(genealogyPeople([]), [])
})

test('root uses entry order of rulers in region, not birth dates', () => {
  const people = [person('first', { group: 'rulers', region: 'Москва', start: 1370 }), person('earlier', { group: 'rulers', region: 'Москва', start: 1300 }), person('other', { group: 'rulers', region: 'Тверь' })]
  assert.equal(firstRegionRoot(people, 'Москва').id, 'first')
  assert.equal(firstRegionRoot(people, 'Тверь').id, 'other')
  assert.equal(firstRegionRoot(people, 'Нет'), undefined)
})

test('all directed roles, reverse links, cycles and disconnected people are retained', () => {
  const people = [
    person('ruler', { group: 'rulers', relations: [{ personId: 'friend', role: 'Друг' }, { personId: 'friend', role: 'Советник' }] }),
    person('friend', { region: 'Другой регион', relations: [{ personId: 'ruler', role: 'Сын' }, { personId: 'third', role: 'Особая роль' }] }),
    person('third', { relations: [{ personId: 'ruler', role: 'Брат' }] }),
    person('island', { relations: [{ personId: 'island-two', role: 'Жена' }] }), person('island-two'), person('alone'),
  ]
  const graph = buildRelationsGraph(people, 'ruler')
  assert.equal(graph.nodes.length, people.length)
  assert.equal(graph.edges.length, 6)
  assert.equal(graph.sections.length, 3)
  assert.equal(graph.edges.find(edge => edge.shape === 'parent').source, 'ruler')
  assert.equal(graph.edges.find(edge => edge.shape === 'parent').target, 'friend')
  assert.equal(graph.edges.find(edge => edge.role === 'Друг').kind, 'close')
  assert.equal(graph.edges.find(edge => edge.shape === 'parent').kind, 'family')
  assert.equal(graph.edges.find(edge => edge.role === 'Особая роль').kind, 'other')
  assert.equal(new Set(graph.edges.slice(0, 3).map(edge => edge.path)).size, 3)
  assert.ok(graph.edges.every(edge => edge.path && Number.isFinite(edge.labelX) && Number.isFinite(edge.labelY)))
})

test('nodes do not overlap in dense and isolated collections', () => {
  const people = Array.from({ length: 40 }, (_, index) => person(String(index), { relations: index > 0 && index < 28 ? [{ personId: '0', role: 'Соратник' }] : [] }))
  const graph = buildRelationsGraph(people, '0')
  assert.equal(graph.nodes.length, 40)
  for (const a of graph.nodes) {
    for (const b of graph.nodes) {
      if (a === b) {
        continue
      }
      assert.ok(a.x + NODE_WIDTH <= b.x || b.x + NODE_WIDTH <= a.x || a.y + NODE_HEIGHT <= b.y || b.y + NODE_HEIGHT <= a.y)
    }
  }
  assert.deepEqual(graph, buildRelationsGraph(people, '0'))
})

test('empty, missing targets and old single-relation records are handled', () => {
  assert.equal(buildRelationsGraph([]).nodes.length, 0)
  const graph = buildRelationsGraph([person('a', { relation: { personId: 'b', role: 'Брат' } }), person('b', { relations: [{ personId: 'missing', role: 'Друг' }] })])
  assert.equal(graph.edges.length, 1)
  assert.equal(graph.missingLinks, 1)
})

test('edge labels remain separate from cards and one another', () => {
  const people = [person('root', { group: 'rulers' }), person('son', { relations: [{ personId: 'root', role: 'Сын' }] }), person('wife', { relations: [{ personId: 'root', role: 'Жена' }, { personId: 'son', role: 'Мать' }] }), person('friend', { relations: [{ personId: 'root', role: 'Друг' }, { personId: 'root', role: 'Советник' }] }), person('rival', { relations: [{ personId: 'son', role: 'Соперник' }] })]
  const graph = buildRelationsGraph(people, 'root')
  const boxes = graph.edges.filter(edge => !edge.hidden).map(edge => {
    const width = Math.min(178, edge.role.length * 7 + 22)
    return { x: edge.labelX - width / 2, y: edge.labelY - 12, width, height: 24 }
  })
  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  for (const [index, box] of boxes.entries()) {
    assert.ok(!boxes.slice(index + 1).some(other => overlaps(box, other)))
    assert.ok(!graph.nodes.some(node => overlaps(box, { x: node.x, y: node.y, width: NODE_WIDTH, height: NODE_HEIGHT })))
  }
})

const relation = (personId, role) => ({ personId, role })
const node = (graph, id) => graph.nodes.find(node => node.person.id === id)

test('the extended Dmitry family keeps each parental family and collateral relation on separate tracks', () => {
  const people = JSON.parse(readFileSync(new URL('fixtures/relations-family-routing.json', import.meta.url), 'utf8'))
  const original = structuredClone(people)
  const graph = buildRelationsGraph(people, 'dmitry')
  const family = graph.edges.filter(edge => edge.kind === 'family' && !edge.hidden)
  const dmitryParents = family.find(edge => edge.shape === 'parent' && edge.target === 'dmitry')
  const ivanParents = family.find(edge => edge.shape === 'parent' && edge.target === 'ivan-maly')
  const evdokiaFather = family.find(edge => edge.shape === 'parent' && edge.target === 'evdokia')
  assert.equal(node(graph, 'evdokia').y, node(graph, 'dmitry').y)
  assert.ok(node(graph, 'dmitry-konstantinovich-suzdal').y < node(graph, 'evdokia').y)
  assert.equal(dmitryParents.points[1].y, ivanParents.points[1].y)
  assert.notEqual(evdokiaFather.points[1].y, dmitryParents.points[1].y)
  const collateral = family.filter(edge => ['cousin', 'sibling'].includes(edge.shape))
  const tracks = [dmitryParents, evdokiaFather, ...collateral].map(edge => edge.points[1].y)
  assert.equal(new Set(tracks).size, tracks.length)
  assert.ok(family.some(edge => edge.path.includes(' Q ')), 'unrelated crossing needs a visible bridge')
  for (const edge of family) {
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1]
      const b = edge.points[i]
      for (const card of graph.nodes) {
        const crosses = a.y === b.y
          ? a.y > card.y && a.y < card.y + NODE_HEIGHT && Math.max(a.x, b.x) > card.x && Math.min(a.x, b.x) < card.x + NODE_WIDTH
          : a.x > card.x && a.x < card.x + NODE_WIDTH && Math.max(a.y, b.y) > card.y && Math.min(a.y, b.y) < card.y + NODE_HEIGHT
        assert.ok(!crosses, `family line crosses ${card.person.id}`)
      }
    }
  }
  assert.equal(graph.explicitCount, 23)
  assert.deepEqual(graph.warnings, [])
  assert.deepEqual(people, original)
})

test('dense family corridors grow vertically while keeping tracks between generations', () => {
  const people = [person('root')]
  for (let i = 0; i < 9; i++) {
    people.push(person(`cousin-${i}`, { relations: [relation('root', 'Двоюродный брат')] }))
  }
  const graph = buildRelationsGraph(people, 'root')
  const root = node(graph, 'root')
  const tracks = graph.edges.map(edge => edge.points[1].y)
  assert.equal(new Set(tracks).size, 9)
  assert.ok(tracks.every(y => y >= 32 && y < root.y - 12))
})

test('parents are above children, spouses share a row, reciprocal facts merge without losing records', () => {
  const people = [person('dad', { start: 1320, relations: [relation('son', 'Отец')] }), person('mom', { start: 1325, relations: [relation('dad', 'Жена'), relation('son', 'Мать')] }), person('son', { relations: [relation('dad', 'Сын')] })]
  const original = structuredClone(people)
  const graph = buildRelationsGraph(people, 'son')
  assert.equal(node(graph, 'dad').y, node(graph, 'mom').y)
  assert.ok(node(graph, 'dad').y < node(graph, 'son').y)
  const parent = graph.edges.find(edge => edge.shape === 'parent' && !edge.hidden)
  assert.deepEqual(new Set(parent.members), new Set(['dad', 'mom', 'son']))
  assert.equal(parent.records.length, 3)
  assert.equal(graph.explicitCount, 4)
  assert.equal(graph.edges.filter(edge => !edge.hidden).length, 2)
  assert.equal(graph.warnings.length, 0)
  assert.deepEqual(people, original)
})

test('a spouse is not assumed to be a parent, and unrecorded ancestors are never added', () => {
  const graph = buildRelationsGraph([person('dad'), person('wife', { relations: [relation('dad', 'Жена')] }), person('child', { relations: [relation('dad', 'Дочь')] }), person('grandchild', { relations: [relation('dad', 'Внук')] })], 'dad')
  assert.equal(graph.nodes.length, 4)
  const parent = graph.edges.find(edge => edge.shape === 'parent')
  assert.deepEqual(parent.parents, ['dad'])
  assert.equal(node(graph, 'grandchild').generation - node(graph, 'dad').generation, 2)
  assert.equal(node(graph, 'child').generation - node(graph, 'dad').generation, 1)
})

test('siblings, cousins, uncles and reversed nephew records respect generation differences', () => {
  const graph = buildRelationsGraph([person('a'), person('sibling', { relations: [relation('a', 'Сестра')] }), person('cousin', { relations: [relation('a', 'Двоюродный брат')] }), person('uncle', { relations: [relation('a', 'Дядя')] }), person('nephew', { relations: [relation('a', 'Племянник')] })], 'a')
  assert.equal(node(graph, 'sibling').generation, 0)
  assert.equal(node(graph, 'cousin').generation, 0)
  assert.equal(node(graph, 'uncle').generation, -1)
  assert.equal(node(graph, 'nephew').generation, 1)
})

test('contradictory ancestry and impossible parent dates produce warnings without dropping people or facts', () => {
  const graph = buildRelationsGraph([person('a', { start: 1400, relations: [relation('b', 'Отец')] }), person('b', { start: 1300, relations: [relation('a', 'Отец')] })])
  assert.equal(graph.nodes.length, 2)
  assert.equal(graph.explicitCount, 2)
  assert.ok(graph.edges.some(edge => edge.conflict))
  assert.ok(graph.warnings.length >= 2)
  assert.ok(graph.edges.every(edge => !edge.path.includes('NaN')))
})

test('regional context requires recorded overlapping years, normalized nonempty region and compatible countries', () => {
  const people = [person('ruler', { group: 'rulers', country: 'Русь', region: ' Москва ', start: 1300, end: 1400 }),
    person('match', { group: 'close', country: 'русь', region: 'москва', start: 1400, end: 1420, before: true }),
    person('explicit', { group: 'close', region: 'Москва', relations: [relation('ruler', 'Советник')] }),
    person('late', { group: 'close', region: 'Москва', start: 1401, end: 1450 }),
    person('foreign', { group: 'close', country: 'Иная', region: 'Москва' }),
    person('unknown', { group: 'close' }), person('other', { group: 'close', region: 'Тверь' })]
  const graph = buildRelationsGraph(people, 'ruler')
  assert.equal(graph.contextCount, 1)
  const context = graph.edges.find(edge => edge.shape === 'context')
  assert.equal(context.target, 'match')
  assert.deepEqual(context.context, { region: 'Москва', start: 1400, end: 1400, approximate: true })
  assert.equal(context.records.length, 0)
  assert.equal(graph.explicitCount, 1)
  const without = buildRelationsGraph(people, 'ruler', { includeContext: false })
  assert.equal(without.contextCount, 0)
  assert.equal(without.explicitCount, 1)
  assert.equal(without.nodes.length, people.length)
})

test('a conflicting parent chain cannot move a spouse into the children generation', () => {
  const graph = buildRelationsGraph([
    person('dmitry', { start: 1350, relations: [relation('vasily', 'Отец'), relation('evdokia', 'Жена')] }),
    person('evdokia', { start: 1353 }),
    person('vasily', { start: 1371, relations: [relation('evdokia', 'Мать')] }),
  ], 'dmitry')
  assert.equal(node(graph, 'evdokia').generation, node(graph, 'dmitry').generation)
  assert.equal(node(graph, 'evdokia').y, node(graph, 'dmitry').y)
  assert.ok(graph.edges.find(edge => edge.shape === 'spouse').conflict === false)
  assert.ok(graph.edges.some(edge => edge.shape === 'parent' && edge.conflict))
  assert.equal(graph.explicitCount, 3)
})

test('Dmitry, Evdokia and Vasily with corrected directed records form two generations', () => {
  const graph = buildRelationsGraph([
    person('dmitry', { start: 1350, relations: [relation('vasily', 'Отец'), relation('evdokia', 'Муж')] }),
    person('evdokia', { start: 1353 }),
    person('vasily', { start: 1371, relations: [relation('evdokia', 'Сын')] }),
  ], 'dmitry')
  assert.equal(node(graph, 'evdokia').y, node(graph, 'dmitry').y)
  assert.ok(node(graph, 'vasily').y > node(graph, 'dmitry').y)
  assert.equal(graph.warnings.length, 0)
  assert.deepEqual(new Set(graph.edges.find(edge => edge.shape === 'parent' && !edge.hidden).parents), new Set(['dmitry', 'evdokia']))
})

test('explicit service to multiple rulers retains each period and suppresses guessed extra rulers', () => {
  const people = ['first', 'second', 'third'].map(id => person(id, { group: 'rulers', region: 'Москва' }))
  people.push(person('advisor', { group: 'close', region: 'Москва', relations: [
    { personId: 'first', role: 'Сподвижник', startYear: 1360, endYear: 1380 },
    { personId: 'second', role: 'Советник', startYear: 1370, endYear: 1390 },
  ] }))
  const graph = buildRelationsGraph(people, 'first')
  assert.equal(graph.contextCount, 0)
  assert.equal(graph.explicitCount, 2)
  assert.equal(graph.edges[0].records[0].endYear, 1380)
  assert.equal(graph.edges[1].records[0].startYear, 1370)
  assert.match(graph.edges[0].role, /1360–1380/)
  assert.match(graph.edges[1].role, /1370–1390/)
  assert.ok(graph.edges.every(edge => edge.shape === 'service' && edge.kind === 'service'))
  assert.equal(graph.edges[0].source, 'first')
  assert.equal(graph.edges[1].source, 'second')
  assert.ok(graph.edges.every(edge => edge.target === 'advisor'))
  assert.equal(graph.edges[0].records[0].source, 'advisor')
  assert.equal(new Set(graph.edges.map(edge => edge.path)).size, 2)
})

test('service lines across generations route around cards', () => {
  const graph = buildRelationsGraph([
    person('ruler', { group: 'rulers', relations: [relation('heir', 'Отец')] }),
    person('heir', { group: 'rulers' }),
    person('advisor', { group: 'close', relations: [relation('ruler', 'Сподвижник'), relation('heir', 'Советник')] }),
  ], 'ruler')
  const service = graph.edges.filter(edge => edge.shape === 'service')
  assert.equal(service.length, 2)
  assert.ok(service.every(edge => edge.points.length >= 2))
  assert.equal(graph.contextCount, 0)
})

test('the nine-person atlas bundles compatible service routes and keeps them clear of cards', () => {
  const people = JSON.parse(readFileSync(new URL('fixtures/relations-routing.json', import.meta.url), 'utf8'))
  const graph = buildRelationsGraph(people, 'dmitry')
  const service = graph.edges.filter(edge => edge.shape === 'service')
  assert.equal(graph.nodes.length, 9)
  assert.equal(service.length, 6)
  assert.equal(graph.explicitCount, 10)
  assert.ok(graph.width < 2000)
  const sourcePorts = service.filter(edge => edge.source === 'dmitry').map(edge => JSON.stringify(edge.points[0]))
  assert.equal(new Set(sourcePorts).size, 1)
  const segments = service.flatMap(edge => edge.points.slice(1).map((b, index) => ({ edge: edge.id, bundle: edge.bundle, a: edge.points[index], b })))
  for (const { a, b } of segments) {
    assert.ok(a.x === b.x || a.y === b.y)
    for (const node of graph.nodes) {
      const overlaps = a.y === b.y
        ? a.y > node.y && a.y < node.y + NODE_HEIGHT && Math.max(a.x, b.x) > node.x && Math.min(a.x, b.x) < node.x + NODE_WIDTH
        : a.x > node.x && a.x < node.x + NODE_WIDTH && Math.max(a.y, b.y) > node.y && Math.min(a.y, b.y) < node.y + NODE_HEIGHT
      assert.ok(!overlaps, `service route crosses ${node.person.id}`)
    }
  }
  for (const [i, first] of segments.entries()) {
    for (const second of segments.slice(i + 1)) {
      if (first.bundle === second.bundle) {
        continue
      }
      const horizontal = first.a.y === first.b.y && second.a.y === second.b.y && first.a.y === second.a.y
      const vertical = first.a.x === first.b.x && second.a.x === second.b.x && first.a.x === second.a.x
      const overlap = horizontal
        ? Math.min(Math.max(first.a.x, first.b.x), Math.max(second.a.x, second.b.x)) - Math.max(Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x))
        : (vertical ? Math.min(Math.max(first.a.y, first.b.y), Math.max(second.a.y, second.b.y)) - Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y)) : 0)
      assert.ok(overlap <= 0, 'different rulers must not share line segments')
    }
  }
  const drawn = graph.serviceBundles.segments
  assert.ok(drawn.some(segment => segment.edgeIds.length === 5 && segment.source === 'dmitry'))
  assert.equal(drawn.filter(segment => segment.arrow).length, 6)
  assert.ok(graph.serviceBundles.junctions.length >= 3)
  const length = segment => Math.abs(segment.b.x - segment.a.x) + Math.abs(segment.b.y - segment.a.y)
  assert.ok(drawn.reduce((sum, segment) => sum + length(segment), 0) < segments.reduce((sum, segment) => sum + length(segment), 0))
  const shared = drawn.find(segment => segment.edgeIds.length === 5)
  assert.ok(shared.members.includes('koshka'))
  assert.ok(shared.members.includes('dmitry'))
  assert.ok(!shared.members.includes('vasily'))
})

test('opposite directions get separate bundles and keep a path to every target', () => {
  const people = [person('root', { group: 'rulers' }), person('left', { group: 'family', relations: [relation('root', 'Сподвижник')] }), person('right', { group: 'close', relations: [relation('root', 'Сподвижник')] })]
  const graph = buildRelationsGraph(people, 'root', { grouped: false })
  const edges = graph.edges.filter(edge => edge.shape === 'service')
  assert.equal(edges.length, 2)
  assert.equal(new Set(edges.map(edge => edge.bundle)).size, 2)
  assert.equal(graph.serviceBundles.segments.filter(segment => segment.arrow).length, 2)
})

test('dynasty columns use normalized recorded names, fall back to roles and keep spouses together', () => {
  const people = [
    person('root', { group: 'rulers', dynasty: 'Рюриковичи', relations: [relation('wife', 'Муж')] }),
    person('wife', { dynasty: 'Другой род' }),
    person('child', { dynasty: ' рюриковичи ', relations: [relation('root', 'Сын')] }),
    person('close', { group: 'close', relations: [relation('root', 'Сподвижник')] }),
    person('clergy', { group: 'clergy' }),
    person('clergy-two', { group: 'clergy' }),
  ]
  const original = structuredClone(people)
  const graph = buildRelationsGraph(people, 'root')
  const clan = graph.clusters.find(cluster => cluster.members.includes('root'))
  assert.deepEqual(new Set(clan.members), new Set(['root', 'wife', 'child']))
  assert.equal(graph.clusters.find(cluster => cluster.members.includes('close')).title, 'Сподвижники и ближний круг')
  assert.deepEqual(new Set(graph.clusters.find(cluster => cluster.members.includes('clergy')).members), new Set(['clergy', 'clergy-two']))
  assert.equal(node(graph, 'root').y, node(graph, 'wife').y)
  assert.equal(Math.abs(node(graph, 'root').x - node(graph, 'wife').x), 290)
  assert.ok(node(graph, 'child').y > node(graph, 'root').y)
  assert.equal(graph.clusters.flatMap(cluster => cluster.members).length, people.length)
  for (const cluster of graph.clusters) {
    for (const id of cluster.members) {
      const card = node(graph, id)
      assert.ok(card.x >= cluster.x && card.x + NODE_WIDTH <= cluster.x + cluster.width)
      assert.ok(card.y >= cluster.y + 56 && card.y + NODE_HEIGHT <= cluster.y + cluster.height)
    }
  }
  const plain = buildRelationsGraph(people, 'root', { grouped: false })
  assert.equal(plain.clusters.length, 0)
  assert.equal(plain.explicitCount, graph.explicitCount)
  assert.deepEqual(people, original)
})

test('contemporaries and clergy use inclusive life overlap without region or country restrictions', () => {
  const people = [person('ruler', { group: 'rulers', start: 1300, end: 1400, region: 'Москва', country: 'Русь' }),
    person('poet', { group: 'contemporaries', start: 1400, end: 1450, region: 'Иной регион', country: 'Другая страна' }),
    person('monk', { group: 'clergy', start: 1320, end: 1380, before: true }),
    person('late', { group: 'clergy', start: 1401, end: 1450 }),
    person('early', { group: 'contemporaries', start: 1200, end: 1299 })]
  const original = structuredClone(people)
  const graph = buildRelationsGraph(people, 'ruler')
  const temporal = graph.edges.filter(edge => edge.shape === 'temporal')
  assert.equal(temporal.length, 2)
  assert.equal(graph.contextCount, 2)
  assert.equal(graph.explicitCount, 0)
  assert.equal(temporal.find(edge => edge.target === 'poet').context.start, 1400)
  assert.equal(temporal.find(edge => edge.target === 'poet').context.end, 1400)
  assert.ok(temporal.find(edge => edge.target === 'monk').context.approximate)
  assert.ok(temporal.every(edge => edge.records.length === 0 && edge.points.length >= 2))
  assert.deepEqual(people, original)
  assert.equal(buildRelationsGraph(people, 'ruler', { includeContext: false }).edges.length, 0)
})

test('temporal bundles group by ruler and category, preserve explicit links and all rulers', () => {
  const people = [person('ruler', { group: 'rulers' }), person('heir', { group: 'rulers' }),
    person('poet', { group: 'contemporaries' }), person('writer', { group: 'contemporaries' }),
    person('monk', { group: 'clergy' }), person('bishop', { group: 'clergy' }),
    person('teacher', { group: 'clergy', relations: [relation('ruler', 'Наставник')] })]
  const graph = buildRelationsGraph(people, 'ruler')
  assert.equal(graph.explicitCount, 1)
  assert.equal(graph.edges.filter(edge => edge.shape === 'temporal').length, 9)
  assert.ok(!graph.edges.some(edge => edge.shape === 'temporal' && edge.source === 'ruler' && edge.target === 'teacher'))
  for (const kind of ['contemporary', 'clergy']) {
    assert.ok(graph.serviceBundles.segments.some(segment => segment.source === 'ruler' && segment.kind === kind && segment.edgeIds.length > 1))
  }
  for (const segment of graph.serviceBundles.segments) {
    assert.ok(segment.edgeIds.every(id => graph.edges.find(edge => edge.id === id).kind === segment.kind))
  }
  assert.ok(graph.edges.some(edge => edge.source === 'heir' && edge.target === 'teacher' && edge.shape === 'temporal'))
})
