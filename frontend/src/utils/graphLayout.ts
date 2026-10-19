import type { Person } from '../data/people'
import { groups } from '../data/people.ts'
import { familyRouteKey, type GraphEdge, isBundledEdge, normalizeGraphText } from './graphRules.ts'

export const NODE_WIDTH = 210
export const NODE_HEIGHT = 96

export interface GraphNode {
  person: Person
  x: number
  y: number
  generation: number
}

export interface GraphSection {
  id: string
  title: string
  y: number
  height: number
  width: number
  entourageX?: number
}

export interface GraphCluster {
  id: string
  title: string
  subtitle: string
  color: string
  x: number
  y: number
  width: number
  height: number
  members: string[]
}

function clusterColumns (nodes: GraphNode[], edges: GraphEdge[], section: GraphSection, rootId?: string) {
  const buckets = new Map<string, { title: string, color: string, dynasty: boolean, units: GraphNode[][] }>()
  const remaining = new Set(nodes)
  for (const node of nodes) {
    if (!remaining.has(node)) {
      continue
    }
    const unit = [node]
    remaining.delete(node)
    // Keep the whole spouse unit together, including spouses from different dynasties.
    for (let index = 0; index < unit.length; index++) {
      for (const edge of edges.filter(edge => edge.shape === 'spouse' && !edge.conflict && edge.members.includes(unit[index]!.person.id))) {
        for (const spouse of remaining) {
          if (spouse.y === node.y && edge.members.includes(spouse.person.id)) {
            unit.push(spouse)
            remaining.delete(spouse)
          }
        }
      }
    }
    unit.sort((a, b) => a.x - b.x)
    const anchor = unit.find(member => member.person.id === rootId) ?? unit.find(member => member.person.dynasty?.trim()) ?? node
    const dynasty = anchor.person.dynasty?.trim().replace(/\s+/g, ' ')
    const role = groups.find(group => group.id === anchor.person.group)!
    const key = dynasty ? `dynasty:${normalizeGraphText(dynasty)}` : `role:${role.id}`
    const bucket = buckets.get(key) ?? { title: dynasty || (role.id === 'close' ? 'Сподвижники и ближний круг' : role.label), color: dynasty ? '#b5a0d4' : role.color, dynasty: !!dynasty, units: [] }
    bucket.units.push(unit)
    buckets.set(key, bucket)
  }
  const ordered = [...buckets.entries()].sort(([a, first], [b, second]) => {
    const hasRoot = (bucket: typeof first) => bucket.units.some(unit => unit.some(node => node.person.id === rootId))
    return Number(hasRoot(second)) - Number(hasRoot(first)) || Number(second.dynasty) - Number(first.dynasty) || a.localeCompare(b, 'ru')
  })
  let x = 64
  const clusters: GraphCluster[] = []
  for (const [key, bucket] of ordered) {
    const placed: GraphNode[] = []
    let width = NODE_WIDTH + 40
    for (const unit of bucket.units) {
      let column = 0
      while (placed.some(other => unit.some((node, index) => {
        const candidateX = x + 20 + (column + index) * 290
        return candidateX < other.x + NODE_WIDTH + 48 && candidateX + NODE_WIDTH + 48 > other.x && node.y < other.y + NODE_HEIGHT + 32 && node.y + NODE_HEIGHT + 32 > other.y
      }))) {
        column++
      }
      for (const [index, node] of unit.entries()) {
        node.x = x + 20 + (column + index) * 290
        placed.push(node)
        width = Math.max(width, node.x - x + NODE_WIDTH + 20)
      }
    }
    const members = placed.map(node => node.person.id)
    clusters.push({ id: `${section.id}:${key}`, title: bucket.title, subtitle: `${bucket.dynasty ? 'Род / династия' : 'Без указанного рода'} · ${members.length}`, color: bucket.color, x, y: section.y + 44, width, height: section.height - 56, members })
    x += width + 36
  }
  section.width = Math.max(620, x - 36)
  section.entourageX = undefined
  return clusters
}

function components (people: Person[], edges: GraphEdge[], rootId?: string) {
  const adjacency = new Map(people.map(person => [person.id, new Set<string>()]))
  for (const edge of edges) {
    for (const member of edge.members) {
      for (const other of edge.members) {
        if (member !== other) {
          adjacency.get(member)!.add(other)
        }
      }
    }
  }
  const ordered = [...people].sort((a, b) => Number(b.id === rootId) - Number(a.id === rootId))
  const visited = new Set<string>()
  const groups: { ids: string[], isolated: boolean }[] = []
  for (const person of ordered) {
    if (visited.has(person.id)) {
      continue
    }
    const isolated = adjacency.get(person.id)!.size === 0 && person.id !== rootId
    const ids = isolated ? ordered.filter(person => !visited.has(person.id) && adjacency.get(person.id)!.size === 0).map(person => person.id) : [person.id]
    for (const id of ids) {
      visited.add(id)
    }
    for (let index = 0; index < ids.length; index++) {
      for (const other of adjacency.get(ids[index]!)!) {
        if (visited.has(other)) {
          continue
        }
        visited.add(other)
        ids.push(other)
      }
    }
    groups.push({ ids, isolated })
  }
  return groups
}

function spouseUnits (row: Person[], edges: GraphEdge[], rootId?: string) {
  const serving = new Set(edges.filter(edge => isBundledEdge(edge)).map(edge => edge.source))
  const units = row.map(person => [person])
  for (const edge of edges.filter(edge => edge.shape === 'spouse' && !edge.conflict)) {
    const a = units.findIndex(unit => unit.some(person => person.id === edge.source))
    const b = units.findIndex(unit => unit.some(person => person.id === edge.target))
    if (a === -1 || b === -1 || a === b) {
      continue
    }
    units[a]!.push(...units[b]!)
    units.splice(b, 1)
  }
  for (const unit of units) {
    unit.sort((a, b) => Number(serving.has(a.id)) - Number(serving.has(b.id)) || a.start - b.start)
    const root = unit.find(person => person.id === rootId)
    if (root) {
      unit.splice(unit.indexOf(root), 1)
      unit.splice(serving.has(root.id) ? unit.length : Math.floor(unit.length / 2), 0, root)
    }
  }
  return units
}

function rowUnits (people: Person[], edges: GraphEdge[], levels: Map<string, number>, rootId?: string) {
  const rows = new Map<number, Person[]>()
  for (const person of people) {
    const level = levels.get(person.id) ?? 0
    const row = rows.get(level) ?? []
    row.push(person)
    rows.set(level, row)
  }
  const ordered = [...rows.entries()].sort(([a], [b]) => a - b)
  const slots = new Map<string, number>()
  return ordered.map(([level, row]) => {
    const units = spouseUnits(row, edges, rootId)
    function score (unit: Person[]) {
      if (unit.some(person => edges.some(edge => isBundledEdge(edge) && edge.source === person.id))) {
        return 1_000_000
      }
      if (unit.some(person => person.id === rootId)) {
        return -1
      }
      const parents = edges.filter(edge => edge.shape === 'parent' && unit.some(person => person.id === edge.target))
      const positions = parents.flatMap(edge => edge.parents.map(id => slots.get(id))).filter((x): x is number => x !== undefined)
      if (positions.length > 0) {
        return positions.reduce((sum, x) => sum + x, 0) / positions.length
      }
      return 10_000 + Math.min(...unit.map(person => person.start))
    }
    units.sort((a, b) => score(a) - score(b))
    let index = 0
    for (const unit of units) {
      for (const person of unit) {
        slots.set(person.id, index++)
      }
    }
    return { level, units }
  })
}

export function layoutGenerations (people: Person[], edges: GraphEdge[], levels: Map<string, number>, rootId?: string, grouped = true) {
  const byId = new Map(people.map(person => [person.id, person]))
  const nodes: GraphNode[] = []
  const sections: GraphSection[] = []
  const clusters: GraphCluster[] = []
  let offsetY = 32
  let width = 700
  for (const component of components(people, edges, rootId)) {
    const members = component.ids.map(id => byId.get(id)!)
    const familyIds = new Set(edges.filter(edge => edge.delta !== undefined).flatMap(edge => edge.members))
    const entourage = members.filter(person => person.id !== rootId && ['close', 'contemporaries', 'clergy'].includes(person.group) && !familyIds.has(person.id) && edges.some(edge => isBundledEdge(edge) && edge.target === person.id))
    const entourageIds = new Set(entourage.map(person => person.id))
    const rows = rowUnits(members.filter(person => !entourageIds.has(person.id)), edges, levels, rootId)
    if (component.isolated) {
      rows.splice(0, rows.length, ...Array.from({ length: Math.ceil(members.length / 4) }, (_, index) => ({ level: index, units: members.slice(index * 4, index * 4 + 4).map(person => [person]) })))
    }
    const rowWidths = rows.map(row => row.units.reduce((sum, unit) => sum + unit.length * 290 + 48, -48))
    const familyWidth = Math.max(620, ...rowWidths.map(value => value + 160))
    const columns = entourage.length > 6 ? 2 : 1
    const entourageX = entourage.length > 0 ? familyWidth + 200 : undefined
    const sectionWidth = entourageX === undefined ? familyWidth : entourageX + columns * 290 + 60
    const minLevel = rows[0]?.level ?? 0
    const maxLevel = rows.at(-1)?.level ?? 0
    const corridors = new Map<number, Set<string>>()
    for (const edge of edges.filter(edge => edge.kind === 'family' && !edge.hidden && !edge.conflict && edge.shape !== 'spouse' && component.ids.includes(edge.source))) {
      const level = levels.get(edge.source) ?? 0
      const band = ['sibling', 'cousin'].includes(edge.shape) ? level - 1 : level
      const tracks = corridors.get(band) ?? new Set<string>()
      tracks.add(familyRouteKey(edge))
      corridors.set(band, tracks)
    }
    const rowStep = Math.max(240, NODE_HEIGHT + 48 + Math.max(0, ...[...corridors.values()].map(tracks => tracks.size)) * 24)
    const groupMargin = grouped ? 56 : 0
    const topMargin = Math.max(80, (corridors.get(minLevel - 1)?.size ?? 0) * 24 + 40) + groupMargin
    const height = Math.max((maxLevel - minLevel + 1) * rowStep + topMargin + 4, Math.ceil(entourage.length / columns) * 160 + 84 + groupMargin)
    const first = members[0]!
    let title = `Отдельная группа · ${first.name}`
    if (component.isolated) {
      title = 'Без указанных связей'
    }
    if (component.ids.includes(rootId ?? '')) {
      title = 'Семья и окружение точки отсчёта'
    }
    sections.push({ id: first.id, title, y: offsetY, height, width: sectionWidth, entourageX })
    for (const [index, row] of rows.entries()) {
      let x = 80 + (familyWidth - 160 - rowWidths[index]!) / 2
      for (const unit of row.units) {
        for (const person of unit) {
          nodes.push({ person, x, y: offsetY + topMargin + (row.level - minLevel) * rowStep, generation: levels.get(person.id) ?? 0 })
          x += 290
        }
        x += 48
      }
    }
    entourage.sort((a, b) => {
      const score = (id: string) => {
        const rulers = edges.filter(edge => isBundledEdge(edge) && edge.target === id).map(edge => levels.get(edge.source) ?? 0)
        return rulers.reduce((sum, value) => sum + value, 0) / Math.max(1, rulers.length)
      }
      return score(a.id) - score(b.id)
    })
    for (const [index, person] of entourage.entries()) {
      nodes.push({ person, x: entourageX! + index % columns * 290, y: offsetY + 80 + groupMargin + Math.floor(index / columns) * 160, generation: levels.get(person.id) ?? 0 })
    }
    const section = sections.at(-1)!
    if (grouped) {
      clusters.push(...clusterColumns(nodes.filter(node => component.ids.includes(node.person.id)), edges, section, rootId))
    }
    width = Math.max(width, section.width + 64)
    offsetY += height + 32
  }
  return { nodes, sections, clusters, width, height: Math.max(320, offsetY) }
}
