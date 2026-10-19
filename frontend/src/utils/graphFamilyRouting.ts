import { type GraphNode, NODE_HEIGHT, NODE_WIDTH } from './graphLayout.ts'
import { familyRouteKey, type GraphEdge } from './graphRules.ts'

type Point = { x: number, y: number }

export function routeFamilyEdges (nodes: GraphNode[], edges: GraphEdge[]) {
  const positions = new Map(nodes.map(node => [node.person.id, node]))
  const family = edges.filter(edge => edge.kind === 'family' && !edge.hidden && !edge.conflict)
  const familyIds = new Set(family.flatMap(edge => edge.members))
  const bands = new Map<number, Map<string, GraphEdge[]>>()
  for (const edge of family) {
    const source = positions.get(edge.source)!
    const target = positions.get(edge.target)!
    if (edge.shape === 'spouse') {
      const left = source.x < target.x ? source : target
      const right = left === source ? target : source
      edge.points = right.x - left.x <= 340
        ? [{ x: left.x + NODE_WIDTH, y: left.y + NODE_HEIGHT / 2 }, { x: right.x, y: right.y + NODE_HEIGHT / 2 }]
        : [{ x: left.x + NODE_WIDTH / 2, y: left.y }, { x: left.x + NODE_WIDTH / 2, y: left.y - 36 }, { x: right.x + NODE_WIDTH / 2, y: right.y - 36 }, { x: right.x + NODE_WIDTH / 2, y: right.y }]
      edge.anchorX = (left.x + NODE_WIDTH + right.x) / 2
      edge.anchorY = right.x - left.x <= 340 ? left.y + NODE_HEIGHT / 2 : left.y - 36
      continue
    }
    const lowerY = Math.max(source.y, target.y)
    const groups = bands.get(lowerY) ?? new Map<string, GraphEdge[]>()
    const key = familyRouteKey(edge)
    const group = groups.get(key) ?? []
    group.push(edge)
    groups.set(key, group)
    bands.set(lowerY, groups)
  }
  for (const [lowerY, groups] of bands) {
    const previousRows = nodes.filter(node => familyIds.has(node.person.id) && node.y < lowerY).map(node => node.y)
    const firstTrack = previousRows.length > 0
      ? Math.max(...previousRows) + NODE_HEIGHT + 24
      : Math.max(32, lowerY - groups.size * 24 - 24)
    for (const [index, group] of [...groups.values()].entries()) {
      const bus = firstTrack + index * 24
      for (const edge of group) {
        const source = positions.get(edge.source)!
        const target = positions.get(edge.target)!
        const tx = target.x + NODE_WIDTH / 2
        let x = source.x + NODE_WIDTH / 2
        let y = source.y
        if (['parent', 'ancestor', 'extended'].includes(edge.shape)) {
          y += NODE_HEIGHT
          if (edge.parents.length === 2) {
            const other = positions.get(edge.parents[1]!)!
            x = (x + other.x + NODE_WIDTH / 2) / 2
            y = Math.abs(other.x - source.x) <= 340 ? source.y + NODE_HEIGHT / 2 : source.y - 36
          }
        }
        edge.points = [{ x, y }, { x, y: bus }, { x: tx, y: bus }, { x: tx, y: target.y }]
        edge.anchorX = (x + tx) / 2
        edge.anchorY = bus
      }
    }
  }
  for (const edge of family) {
    edge.path = polyline(edge.points!)
  }
}

function polyline (points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

// A bridge marks a crossing of unrelated families; only a shared parent group is a junction.
export function bridgeFamilyCrossings (edges: GraphEdge[]) {
  const family = edges.filter(edge => edge.kind === 'family' && !edge.hidden && !edge.conflict && edge.points)
  for (const edge of family) {
    const points = edge.points!
    let path = `M ${points[0]!.x} ${points[0]!.y}`
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1]!
      const b = points[index]!
      const crossings = new Set<number>()
      if (a.y === b.y && a.x !== b.x) {
        for (const other of family.filter(other => familyRouteKey(other) !== familyRouteKey(edge))) {
          for (let i = 1; i < other.points!.length; i++) {
            const c = other.points![i - 1]!
            const d = other.points![i]!
            if (c.x === d.x && c.x > Math.min(a.x, b.x) + 8 && c.x < Math.max(a.x, b.x) - 8 && a.y > Math.min(c.y, d.y) && a.y < Math.max(c.y, d.y)) {
              crossings.add(c.x)
            }
          }
        }
      }
      const direction = Math.sign(b.x - a.x)
      let last: number | undefined
      for (const x of [...crossings].sort((x, y) => direction * (x - y))) {
        if (last !== undefined && Math.abs(x - last) < 16) {
          continue
        }
        path += ` L ${x - direction * 6} ${a.y} Q ${x} ${a.y - 12} ${x + direction * 6} ${a.y}`
        last = x
      }
      path += ` L ${b.x} ${b.y}`
    }
    edge.path = path
  }
}
