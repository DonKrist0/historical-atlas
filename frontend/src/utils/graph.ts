import type { Person } from '../data/people'
import { buildServiceBundles } from './graphBundles.ts'
import { bridgeFamilyCrossings, routeFamilyEdges } from './graphFamilyRouting.ts'
import { type GraphNode, layoutGenerations, NODE_HEIGHT, NODE_WIDTH } from './graphLayout.ts'
import { routeServiceEdges } from './graphRouting.ts'
import { assignGenerations, collectGraphRelations, combineParentEdges, type GraphEdge, isBundledEdge, normalizeGraphText } from './graphRules.ts'

export { NODE_HEIGHT, NODE_WIDTH } from './graphLayout.ts'

export function firstRegionRoot (people: Person[], region: string): Person | undefined {
  const candidates = people.filter(person => region === '*' || normalizeGraphText(person.region) === normalizeGraphText(region))
  return candidates.find(person => person.group === 'rulers') ?? candidates[0]
}

export function buildRelationsGraph (people: Person[], rootId?: string, options: { includeContext?: boolean, grouped?: boolean, sameCountryPerspective?: boolean } = {}) {
  const root = people.find(person => person.id === rootId) ?? firstRegionRoot(people, '*')
  const { edges, missingLinks, explicitCount } = collectGraphRelations(people, options.includeContext ?? true, options.sameCountryPerspective ?? false)
  const { levels, warnings } = assignGenerations(people, edges, root?.id)
  combineParentEdges(edges)
  const layout = layoutGenerations(people, edges, levels, root?.id, options.grouped ?? true)
  const serviceBundles = routeEdges(layout.nodes, edges)
  const height = Math.max(layout.height, ...edges.filter(edge => !edge.hidden).map(edge => Math.max(edge.labelY, ...(edge.points ?? []).map(point => point.y)) + 40))
  const width = Math.max(layout.width, ...edges.map(edge => Math.max(edge.labelX, ...(edge.points ?? []).map(point => point.x)) + 110))
  return { ...layout, serviceBundles, width, height, edges, root, missingLinks, explicitCount, warnings, contextCount: edges.filter(edge => !!edge.context).length }
}

function routeEdges (nodes: GraphNode[], edges: GraphEdge[]) {
  const positions = new Map(nodes.map(node => [node.person.id, node]))
  const lanes = new Map<string, number>()
  routeFamilyEdges(nodes, edges)
  for (const edge of edges.filter(edge => !edge.hidden && !isBundledEdge(edge))) {
    const source = positions.get(edge.source)!
    const target = positions.get(edge.target)!
    const key = JSON.stringify([edge.source, edge.target].sort())
    const lane = lanes.get(key) ?? 0
    lanes.set(key, lane + 1)
    if (edge.kind !== 'family' || edge.conflict) {
      routeCurve(edge, source, target, lane)
    }
  }
  routeServiceEdges(nodes, edges)
  bridgeFamilyCrossings(edges)
  const serviceBundles = buildServiceBundles(edges)
  for (const edge of edges) {
    edge.labelX = edge.anchorX
    edge.labelY = edge.anchorY
  }
  separateLabels(nodes, edges.filter(edge => !edge.hidden))
  return serviceBundles
}

function routeCurve (edge: GraphEdge, source: GraphNode, target: GraphNode, lane: number) {
  const sameRow = source.y === target.y
  const direction = target.x >= source.x ? 1 : -1
  const x1 = sameRow ? source.x + NODE_WIDTH / 2 : source.x + (direction > 0 ? NODE_WIDTH : 0)
  const x2 = sameRow ? target.x + NODE_WIDTH / 2 : target.x + (direction > 0 ? 0 : NODE_WIDTH)
  const y1 = sameRow ? source.y + NODE_HEIGHT : source.y + NODE_HEIGHT / 2
  const y2 = sameRow ? target.y + NODE_HEIGHT : target.y + NODE_HEIGHT / 2
  const bend = 76 + lane * 36
  const c1x = sameRow ? x1 : x1 + direction * bend
  const c2x = sameRow ? x2 : x2 - direction * bend
  const c1y = sameRow ? y1 + bend : y1 + lane * 24
  const c2y = sameRow ? y2 + bend : y2 + lane * 24
  edge.path = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`
  edge.anchorX = (x1 + 3 * c1x + 3 * c2x + x2) / 8
  edge.anchorY = (y1 + 3 * c1y + 3 * c2y + y2) / 8
}

function separateLabels (nodes: GraphNode[], edges: GraphEdge[]) {
  const occupied = nodes.map(node => ({ x: node.x - 8, y: node.y - 8, width: NODE_WIDTH + 16, height: NODE_HEIGHT + 16 }))
  for (const edge of edges) {
    const width = Math.min(178, edge.role.length * 7 + 22) + 10
    const lines = edges.filter(other => other !== edge && (!edge.bundle || edge.bundle !== other.bundle)).flatMap(other => (other.points ?? []).slice(1).map((point, index) => {
      const before = other.points![index]!
      return { x: Math.min(before.x, point.x) - 3, y: Math.min(before.y, point.y) - 3, width: Math.abs(before.x - point.x) + 6, height: Math.abs(before.y - point.y) + 6 }
    }))
    for (let attempt = 0; attempt < 500; attempt++) {
      const row = Math.floor(attempt / 5)
      const step = Math.ceil(row / 2) * 32
      const y = edge.anchorY + (row % 2 === 0 ? step : -step)
      const x = edge.anchorX + [0, 48, -48, 96, -96][attempt % 5]!
      if (y < 56) {
        continue
      }
      const candidate = { x: x - width / 2, y: y - 16, width, height: 32 }
      if (candidate.x < 32) {
        continue
      }
      const overlaps = [...occupied, ...lines].some(rect => candidate.x < rect.x + rect.width && candidate.x + candidate.width > rect.x && candidate.y < rect.y + rect.height && candidate.y + candidate.height > rect.y)
      if (overlaps) {
        continue
      }
      edge.labelY = y
      edge.labelX = x
      occupied.push(candidate)
      break
    }
  }
}

export function graphNameLines (name: string): string[] {
  const lines: string[] = []
  for (const word of name.split(/\s+/)) {
    const last = lines.at(-1)
    if (last && `${last} ${word}`.length <= 24) {
      lines[lines.length - 1] = `${last} ${word}`
    } else {
      lines.push(word)
    }
  }
  return lines.slice(0, 2).map((line, index) => line.length > 25 || (index === 1 && lines.length > 2) ? `${line.slice(0, 23)}…` : line)
}
