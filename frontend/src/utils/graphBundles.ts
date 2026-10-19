import { type GraphEdge, isBundledEdge } from './graphRules.ts'

interface Point { x: number, y: number }
export interface ServiceSegment {
  id: string
  bundle: string
  source: string
  kind: GraphEdge['kind']
  a: Point
  b: Point
  path: string
  edgeIds: string[]
  members: string[]
  arrow: boolean
}

export function buildServiceBundles (edges: GraphEdge[]) {
  const groups = new Map<string, { edge: GraphEdge, a: Point, b: Point }[]>()
  for (const edge of edges.filter(edge => isBundledEdge(edge))) {
    for (const [index, b] of (edge.points ?? []).slice(1).entries()) {
      const a = edge.points![index]!
      const key = JSON.stringify([edge.bundle, a.y === b.y ? 'h' : 'v', a.y === b.y ? a.y : a.x])
      const group = groups.get(key) ?? []
      group.push({ edge, a, b })
      groups.set(key, group)
    }
  }
  const segments: ServiceSegment[] = []
  for (const [key, group] of groups) {
    const horizontal = group[0]!.a.y === group[0]!.b.y
    const coordinate = (point: Point) => horizontal ? point.x : point.y
    const cuts = [...new Set(group.flatMap(item => [coordinate(item.a), coordinate(item.b)]))].sort((a, b) => a - b)
    for (let i = 1; i < cuts.length; i++) {
      const from = cuts[i - 1]!
      const to = cuts[i]!
      const covering = group.filter(item => Math.min(coordinate(item.a), coordinate(item.b)) <= from && Math.max(coordinate(item.a), coordinate(item.b)) >= to)
      if (covering.length === 0) {
        continue
      }
      const first = covering[0]!
      const point = (value: number): Point => horizontal ? { x: value, y: first.a.y } : { x: first.a.x, y: value }
      const forward = coordinate(first.b) > coordinate(first.a)
      const a = point(forward ? from : to)
      const b = point(forward ? to : from)
      const linked = [...new Map(covering.map(item => [item.edge.id, item.edge])).values()]
      const arrow = linked.some(edge => {
        const end = edge.points!.at(-1)!
        return end.x === b.x && end.y === b.y
      })
      segments.push({ id: `${key}:${from}:${to}`, bundle: first.edge.bundle!, source: first.edge.source, kind: first.edge.kind, a, b, path: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, edgeIds: linked.map(edge => edge.id), members: [...new Set(linked.flatMap(edge => edge.members))], arrow })
    }
  }
  // Put relationship labels on their own branches, rather than on the shared trunk.
  for (const edge of edges.filter(edge => isBundledEdge(edge))) {
    const own = segments.filter(segment => segment.edgeIds.includes(edge.id) && segment.edgeIds.length === 1)
    const candidates = own.length > 0 ? own : segments.filter(segment => segment.edgeIds.includes(edge.id))
    const length = (segment: ServiceSegment) => Math.abs(segment.b.x - segment.a.x) + Math.abs(segment.b.y - segment.a.y)
    candidates.sort((a, b) => length(b) - length(a))
    const longest = candidates[0]
    if (!longest) {
      continue
    }
    edge.anchorX = (longest.a.x + longest.b.x) / 2
    edge.anchorY = (longest.a.y + longest.b.y) / 2
  }
  const vertices = new Map<string, { point: Point, segments: ServiceSegment[] }>()
  for (const segment of segments) {
    for (const point of [segment.a, segment.b]) {
      const key = JSON.stringify([segment.bundle, point.x, point.y])
      const vertex = vertices.get(key) ?? { point, segments: [] }
      vertex.segments.push(segment)
      vertices.set(key, vertex)
    }
  }
  const junctions = [...vertices.entries()].filter(([, vertex]) => vertex.segments.length > 2).map(([id, vertex]) => ({ id, ...vertex.point, kind: vertex.segments[0]!.kind, members: [...new Set(vertex.segments.flatMap(segment => segment.members))] }))
  return { segments, junctions }
}
