import type { Person } from '../data/people'
import { relationPeriod } from './relationPeriod.ts'

export type RelationShape = 'parent' | 'spouse' | 'sibling' | 'ancestor' | 'cousin' | 'extended' | 'association' | 'service' | 'temporal' | 'other' | 'context'

export interface RelationRecord {
  id: string
  source: string
  target: string
  role: string
  startYear?: number
  endYear?: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  members: string[]
  parents: string[]
  role: string
  shape: RelationShape
  kind: 'family' | 'close' | 'service' | 'contemporary' | 'clergy' | 'other' | 'context'
  records: RelationRecord[]
  delta?: number
  context?: { region: string, start: number, end: number, approximate: boolean }
  conflict: boolean
  hidden: boolean
  path: string
  labelX: number
  labelY: number
  anchorX: number
  anchorY: number
  points?: { x: number, y: number }[]
  bundle?: string
}

export interface GraphWarning {
  id: string
  message: string
  people: string[]
}

export function isBundledEdge (edge: GraphEdge): boolean {
  return edge.shape === 'service' || edge.shape === 'temporal'
}

export function familyRouteKey (edge: GraphEdge): string {
  return edge.parents.length > 0 ? JSON.stringify(['parents', ...[...edge.parents].sort()]) : edge.id
}

export function normalizeGraphText (value?: string): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru').replaceAll('ё', 'е')
}

const parentRoles = new Set(['отец', 'мать', 'родитель'])
const childRoles = new Set(['сын', 'дочь', 'ребенок'])
const spouseRoles = new Set(['муж', 'жена', 'супруг', 'супруга'])
const siblingRoles = new Set(['брат', 'сестра'])
const ancestorRoles = new Set(['дед', 'бабушка'])
const descendantRoles = new Set(['внук', 'внучка'])
const elderRoles = new Set(['дядя', 'тетя'])
const youngerRoles = new Set(['племянник', 'племянница'])
const cousinRoles = new Set(['двоюродный брат', 'двоюродная сестра'])
const closeRoles = new Set(['друг', 'советник', 'соратник', 'сподвижник'])
const affinityRoles = new Set(['свояк', 'свояченица', 'зять', 'невестка', 'сноха', 'тесть', 'теща', 'свекор', 'свекровь', 'шурин', 'деверь', 'золовка', 'муж сестры', 'жена брата'])

export function isKinshipRole (role: string): boolean {
  const normalized = normalizeGraphText(role)
  return [parentRoles, childRoles, spouseRoles, siblingRoles, ancestorRoles, descendantRoles, elderRoles, youngerRoles, cousinRoles, affinityRoles].some(roles => roles.has(normalized))
}

function classify (record: RelationRecord) {
  const role = normalizeGraphText(record.role)
  let source = record.source
  let target = record.target
  let shape: RelationShape = 'other'
  let delta: number | undefined
  if (parentRoles.has(role) || childRoles.has(role)) {
    shape = 'parent'
    delta = 1
    if (childRoles.has(role)) {
      [source, target] = [target, source]
    }
  } else if (spouseRoles.has(role) || siblingRoles.has(role) || cousinRoles.has(role)) {
    delta = 0
    ;[source, target] = [source, target].sort() as [string, string]
    if (spouseRoles.has(role)) {
      shape = 'spouse'
    }
    if (siblingRoles.has(role)) {
      shape = 'sibling'
    }
    if (cousinRoles.has(role)) {
      shape = 'cousin'
    }
  } else if (ancestorRoles.has(role) || descendantRoles.has(role)) {
    shape = 'ancestor'
    delta = 2
    if (descendantRoles.has(role)) {
      [source, target] = [target, source]
    }
  } else if (elderRoles.has(role) || youngerRoles.has(role)) {
    shape = 'extended'
    delta = 1
    if (youngerRoles.has(role)) {
      [source, target] = [target, source]
    }
  } else if (closeRoles.has(role)) {
    shape = 'association'
  }
  return { source, target, shape, delta }
}

function createEdge (record: RelationRecord): GraphEdge {
  const { source, target, shape, delta } = classify(record)
  let kind: GraphEdge['kind'] = 'family'
  if (shape === 'association') {
    kind = 'close'
  }
  if (shape === 'other') {
    kind = 'other'
  }
  const labels: Partial<Record<RelationShape, string>> = {
    parent: 'Родитель — ребёнок', spouse: 'Супруги', sibling: 'Брат / сестра',
    ancestor: 'Через поколение', cousin: 'Двоюродные', extended: 'Дядя / тётя — племянник',
  }
  return {
    id: record.id, source, target, shape, delta, kind,
    members: [source, target], parents: shape === 'parent' ? [source] : [],
    role: labels[shape] ?? (record.startYear !== undefined || record.endYear !== undefined ? `${record.role} · ${relationPeriod(record)}` : record.role), records: [record], conflict: false, hidden: false,
    path: '', labelX: 0, labelY: 0, anchorX: 0, anchorY: 0,
  }
}

export function graphPairKey (a: string, b: string): string {
  return JSON.stringify([a, b].sort())
}

export function collectGraphRelations (people: Person[], includeContext: boolean) {
  const byId = new Map(people.map(person => [person.id, person]))
  const unique = new Map<string, GraphEdge>()
  const explicitPairs = new Set<string>()
  let missingLinks = 0
  for (const person of people) {
    for (const [index, relation] of (person.relations ?? (person.relation ? [person.relation] : [])).entries()) {
      if (!byId.has(relation.personId)) {
        missingLinks++
        continue
      }
      const record = { ...relation, id: `${person.id}:${index}`, source: person.id, target: relation.personId }
      const edge = createEdge(record)
      if (byId.get(relation.personId)?.group === 'rulers' && ['советник', 'соратник', 'сподвижник'].includes(normalizeGraphText(relation.role))) {
        edge.shape = 'service'
        edge.kind = 'service'
        edge.source = relation.personId
        edge.target = person.id
      }
      explicitPairs.add(graphPairKey(person.id, relation.personId))
      const key = JSON.stringify([edge.shape, edge.source, edge.target, edge.delta === undefined ? normalizeGraphText(relation.role) : ''])
      const existing = unique.get(key)
      if (existing) {
        existing.records.push(record)
      } else {
        unique.set(key, edge)
      }
    }
  }
  const edges = [...unique.values()]
  if (includeContext) {
    addContextEdges(people, edges, explicitPairs)
    addTemporalEdges(people, edges, explicitPairs)
  }
  return { edges, missingLinks, explicitCount: edges.reduce((sum, edge) => sum + edge.records.length, 0) }
}

function addTemporalEdges (people: Person[], edges: GraphEdge[], explicitPairs: Set<string>) {
  for (const ruler of people.filter(person => person.group === 'rulers')) {
    for (const person of people.filter(person => person.group === 'contemporaries' || person.group === 'clergy')) {
      if (explicitPairs.has(graphPairKey(ruler.id, person.id))) {
        continue
      }
      const start = Math.max(ruler.start, person.start)
      const end = Math.min(ruler.end, person.end)
      if (start > end) {
        continue
      }
      const kind = person.group === 'clergy' ? 'clergy' : 'contemporary'
      const label = kind === 'clergy' ? 'Духовенство' : 'Современник'
      const edge = createEdge({ id: `temporal:${ruler.id}:${person.id}`, source: ruler.id, target: person.id, role: `${label} · ${start}–${end}` })
      edges.push({ ...edge, shape: 'temporal', kind, records: [], context: { region: '', start, end, approximate: !!(ruler.before || person.before) } })
    }
  }
}

function addContextEdges (people: Person[], edges: GraphEdge[], explicitPairs: Set<string>) {
  const rulers = new Set(people.filter(person => person.group === 'rulers').map(person => person.id))
  const assigned = new Set(edges.filter(edge => edge.shape === 'association' || edge.shape === 'service').flatMap(edge => {
    if (rulers.has(edge.source)) {
      return [edge.target]
    }
    if (rulers.has(edge.target)) {
      return [edge.source]
    }
    return []
  }))
  for (const ruler of people.filter(person => person.group === 'rulers')) {
    const region = normalizeGraphText(ruler.region)
    if (!region) {
      continue
    }
    for (const person of people.filter(person => person.group === 'close')) {
      if (assigned.has(person.id)) {
        continue
      }
      if (normalizeGraphText(person.region) !== region) {
        continue
      }
      if (ruler.country && person.country && normalizeGraphText(ruler.country) !== normalizeGraphText(person.country)) {
        continue
      }
      if (explicitPairs.has(graphPairKey(ruler.id, person.id))) {
        continue
      }
      const start = Math.max(ruler.start, person.start)
      const end = Math.min(ruler.end, person.end)
      if (start > end) {
        continue
      }
      const edge = createEdge({ id: `context:${ruler.id}:${person.id}`, source: ruler.id, target: person.id, role: `Современники · ${start}–${end}` })
      edges.push({ ...edge, shape: 'context', kind: 'context', records: [], context: { region: ruler.region!.trim(), start, end, approximate: !!(ruler.before || person.before) } })
    }
  }
}

// A weighted union-find stores generation differences: generation(target) = generation(source) + delta.
class Generations {
  private parents = new Map<string, string>()
  private offsets = new Map<string, number>()

  constructor (ids: string[]) {
    for (const id of ids) {
      this.parents.set(id, id)
      this.offsets.set(id, 0)
    }
  }

  resolve (id: string): { root: string, offset: number } {
    const parent = this.parents.get(id)!
    if (parent === id) {
      return { root: id, offset: 0 }
    }
    const found = this.resolve(parent)
    const offset = this.offsets.get(id)! + found.offset
    this.parents.set(id, found.root)
    this.offsets.set(id, offset)
    return { root: found.root, offset }
  }

  connect (source: string, target: string, delta: number): boolean {
    const a = this.resolve(source)
    const b = this.resolve(target)
    if (a.root === b.root) {
      return b.offset - a.offset === delta
    }
    this.parents.set(b.root, a.root)
    this.offsets.set(b.root, a.offset + delta - b.offset)
    return true
  }
}

export function assignGenerations (people: Person[], edges: GraphEdge[], rootId?: string) {
  const generations = new Generations(people.map(person => person.id))
  const warnings: GraphWarning[] = []
  // Keep explicit partners together; conflicting ancestry must not move a spouse into the children's row.
  const priority = { spouse: 0, parent: 1, sibling: 2, ancestor: 3, cousin: 4, extended: 5, association: 6, service: 6, other: 7, context: 8, temporal: 8 }
  for (const edge of [...edges].sort((a, b) => priority[a.shape] - priority[b.shape])) {
    if (edge.delta === undefined) {
      continue
    }
    if (!generations.connect(edge.source, edge.target, edge.delta)) {
      edge.conflict = true
      warnings.push({ id: edge.id, people: edge.members, message: 'Связь противоречит поколениям в других семейных записях. Проверьте роли.' })
    }
  }
  const offsets = new Map<string, number>()
  const root = rootId ? generations.resolve(rootId) : undefined
  if (root) {
    offsets.set(root.root, -root.offset)
  }
  // Other families and entourage can be aligned with a connected ruler without claiming kinship.
  for (let pass = 0; pass < people.length; pass++) {
    let changed = false
    for (const edge of edges) {
      const a = generations.resolve(edge.source)
      const b = generations.resolve(edge.target)
      if (offsets.has(a.root) && !offsets.has(b.root)) {
        offsets.set(b.root, offsets.get(a.root)! + a.offset - b.offset)
        changed = true
      } else if (offsets.has(b.root) && !offsets.has(a.root)) {
        offsets.set(a.root, offsets.get(b.root)! + b.offset - a.offset)
        changed = true
      }
    }
    if (!changed) {
      break
    }
  }
  const levels = new Map(people.map(person => {
    const found = generations.resolve(person.id)
    return [person.id, found.offset + (offsets.get(found.root) ?? 0)]
  }))
  const byId = new Map(people.map(person => [person.id, person]))
  for (const edge of edges.filter(edge => edge.shape === 'parent')) {
    const parent = byId.get(edge.source)!
    const child = byId.get(edge.target)!
    if (!parent.before && !child.before && parent.start > child.start) {
      warnings.push({ id: `dates:${edge.id}`, people: edge.members, message: 'Указанный родитель родился позже ребёнка. Проверьте годы жизни или направление связи.' })
    }
  }
  return { levels, warnings }
}

export function combineParentEdges (edges: GraphEdge[]) {
  const spouses = new Set(edges.filter(edge => edge.shape === 'spouse' && !edge.conflict).map(edge => graphPairKey(edge.source, edge.target)))
  const byChild = new Map<string, GraphEdge[]>()
  for (const edge of edges.filter(edge => edge.shape === 'parent' && !edge.conflict)) {
    const parents = byChild.get(edge.target) ?? []
    parents.push(edge)
    byChild.set(edge.target, parents)
  }
  for (const parentEdges of byChild.values()) {
    if (parentEdges.length !== 2) {
      continue
    }
    const [a, b] = parentEdges as [GraphEdge, GraphEdge]
    if (!spouses.has(graphPairKey(a.source, b.source))) {
      continue
    }
    a.parents = [a.source, b.source]
    a.members = [...a.parents, a.target]
    a.records.push(...b.records)
    a.role = 'Родители — ребёнок'
    b.hidden = true
    b.records = []
  }
}
