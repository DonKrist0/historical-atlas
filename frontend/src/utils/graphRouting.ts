import { type GraphNode, NODE_HEIGHT, NODE_WIDTH } from './graphLayout.ts'
import { type GraphEdge, isBundledEdge } from './graphRules.ts'

interface Point { x: number, y: number }
interface Segment { a: Point, b: Point, bundle?: string }

function intersects (a: Point, b: Point, node: GraphNode): boolean {
  const left = node.x - 12
  const right = node.x + NODE_WIDTH + 12
  const top = node.y - 12
  const bottom = node.y + NODE_HEIGHT + 12
  if (a.y === b.y) {
    return a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right
  }
  return a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom
}

function congestion (a: Point, b: Point, used: Segment[], bundle: string): number {
  let cost = 0
  let shared = 0
  for (const segment of used) {
    const { a: c, b: d } = segment
    const horizontal = a.y === b.y
    const otherHorizontal = c.y === d.y
    if (horizontal === otherHorizontal) {
      if ((horizontal ? a.y !== c.y : a.x !== c.x)) {
        continue
      }
      const overlap = horizontal
        ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
        : Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y))
      if (overlap > 0) {
        if (segment.bundle === bundle) {
          shared = Math.max(shared, overlap)
        } else {
          cost += 300 + overlap * 8
        }
      }
    } else {
      const h = horizontal ? { a, b } : segment
      const v = horizontal ? segment : { a, b }
      if (segment.bundle !== bundle && v.a.x > Math.min(h.a.x, h.b.x) && v.a.x < Math.max(h.a.x, h.b.x) && h.a.y > Math.min(v.a.y, v.b.y) && h.a.y < Math.max(v.a.y, v.b.y)) {
        cost += 90
      }
    }
  }
  return cost - shared * 0.85
}

class Queue {
  private items: { id: number, cost: number }[] = []
  push (item: { id: number, cost: number }) {
    const items = this.items
    items.push(item)
    let index = items.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (items[parent]!.cost <= item.cost) {
        break
      }
      items[index] = items[parent]!
      index = parent
    }
    items[index] = item
  }

  pop () {
    const first = this.items[0]
    const last = this.items.pop()
    if (this.items.length > 0 && last) {
      let index = 0
      while (index * 2 + 1 < this.items.length) {
        let child = index * 2 + 1
        if (child + 1 < this.items.length && this.items[child + 1]!.cost < this.items[child]!.cost) {
          child++
        }
        if (this.items[child]!.cost >= last.cost) {
          break
        }
        this.items[index] = this.items[child]!
        index = child
      }
      this.items[index] = last
    }
    return first
  }
}

function route (start: Point, end: Point, nodes: GraphNode[], used: Segment[], channels: number[], bundle: string): Point[] {
  const xs = [...new Set([start.x, end.x, 48, ...channels, ...nodes.flatMap(node => [node.x - 24, node.x + NODE_WIDTH + 24])])].sort((a, b) => a - b)
  const ys = [...new Set([start.y, end.y, 80, ...nodes.flatMap(node => [node.y - 24, node.y + NODE_HEIGHT + 24]), ...used.flatMap(segment => [segment.a.y, segment.b.y, segment.a.y - 16, segment.a.y + 16, segment.b.y - 16, segment.b.y + 16]).filter(y => y >= 80)])].sort((a, b) => a - b)
  const cols = xs.length
  const point = (cell: number): Point => ({ x: xs[cell % cols]!, y: ys[Math.floor(cell / cols)]! })
  const first = (ys.indexOf(start.y) * cols + xs.indexOf(start.x)) * 3
  const goal = ys.indexOf(end.y) * cols + xs.indexOf(end.x)
  const distance = new Map([[first, 0]])
  const previous = new Map<number, number>()
  const queue = new Queue()
  queue.push({ id: first, cost: 0 })
  let found: number | undefined
  for (let item = queue.pop(); item; item = queue.pop()) {
    if (item.cost !== distance.get(item.id)) {
      continue
    }
    const cell = Math.floor(item.id / 3)
    if (cell === goal) {
      found = item.id
      break
    }
    const a = point(cell)
    const col = cell % cols
    const row = Math.floor(cell / cols)
    const neighbors = [col > 0 ? cell - 1 : -1, col < cols - 1 ? cell + 1 : -1, row > 0 ? cell - cols : -1, row < ys.length - 1 ? cell + cols : -1]
    for (const next of neighbors) {
      if (next < 0) {
        continue
      }
      const b = point(next)
      if (nodes.some(node => intersects(a, b, node))) {
        continue
      }
      const direction = a.y === b.y ? 1 : 2
      const id = next * 3 + direction
      const bend = item.id % 3 !== 0 && item.id % 3 !== direction ? 35 : 0
      const cost = item.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + bend + congestion(a, b, used, bundle)
      if (cost >= (distance.get(id) ?? Infinity)) {
        continue
      }
      distance.set(id, cost)
      previous.set(id, item.id)
      queue.push({ id, cost })
    }
  }
  if (found === undefined) {
    throw new Error('Не удалось проложить линию службы между карточками')
  }
  const points: Point[] = []
  for (let id: number | undefined = found; id !== undefined; id = previous.get(id)) {
    points.push(point(Math.floor(id / 3)))
  }
  return points.reverse()
}

function simplify (points: Point[]): Point[] {
  return points.filter((point, index) => {
    const before = points[index - 1]
    const after = points[index + 1]
    return !before || !after || !((before.x === point.x && point.x === after.x) || (before.y === point.y && point.y === after.y))
  })
}

export function routeServiceEdges (nodes: GraphNode[], edges: GraphEdge[]) {
  const byId = new Map(nodes.map(node => [node.person.id, node]))
  const service = edges.filter(edge => isBundledEdge(edge))
  const used: Segment[] = []
  for (const edge of edges.filter(edge => edge.kind === 'family' && !edge.hidden && !edge.conflict)) {
    if (edge.points) {
      used.push(...edge.points.slice(1).map((point, index) => ({ a: edge.points![index]!, b: point })))
      continue
    }
    const tokens = edge.path.match(/[MHV]|-?\d+(?:\.\d+)?/g) ?? []
    let previous: Point | undefined
    for (let i = 0; i < tokens.length;) {
      const command = tokens[i++]
      const value = Number(tokens[i++])
      let next: Point
      if (command === 'M') {
        next = { x: value, y: Number(tokens[i++]) }
      } else {
        next = command === 'H' ? { x: value, y: previous!.y } : { x: previous!.x, y: value }
      }
      if (previous && command !== 'M') {
        used.push({ a: previous, b: next })
      }
      previous = next
    }
  }
  const ports = new Map<string, GraphEdge[]>()
  for (const edge of service) {
    for (const id of [edge.source, edge.target]) {
      const group = ports.get(id) ?? []
      group.push(edge)
      ports.set(id, group)
    }
  }
  const channels = nodes.flatMap(node => Array.from({ length: Math.min(service.length + 1, 12) }, (_, i) => node.x + NODE_WIDTH + 24 + i * 18))
  for (const edge of service) {
    const source = byId.get(edge.source)!
    const target = byId.get(edge.target)!
    const direction = target.x >= source.x + NODE_WIDTH ? 1 : -1
    const bundle = `${edge.kind}:${edge.source}:${direction}`
    edge.bundle = bundle
    const port = (node: GraphNode, outgoing: boolean): Point => {
      const group = ports.get(node.person.id)!
      const index = group.indexOf(edge)
      const x = node.x + ((outgoing ? direction > 0 : direction < 0) ? NODE_WIDTH : 0)
      const kinds = [...new Set(group.filter(item => item.source === node.person.id).map(item => item.kind))]
      const offset = outgoing ? 18 + (kinds.indexOf(edge.kind) + 1) * 60 / (kinds.length + 1) : 18 + (index + 1) * 60 / (group.length + 1)
      return { x, y: node.y + (Math.abs(offset - NODE_HEIGHT / 2) < 3 ? offset + 4 : offset) }
    }
    const a = port(source, true)
    const b = port(target, false)
    const start = { x: a.x + direction * 18, y: a.y }
    const end = { x: b.x - direction * 18, y: b.y }
    const points = simplify([a, ...route(start, end, nodes, used, channels, bundle), b])
    edge.points = points
    edge.path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
    const segments = points.slice(1).map((point, index) => ({ a: points[index]!, b: point, bundle }))
    const longest = [...segments].sort((a, b) => (Math.abs(b.b.x - b.a.x) + Math.abs(b.b.y - b.a.y)) - (Math.abs(a.b.x - a.a.x) + Math.abs(a.b.y - a.a.y)))[0]!
    edge.anchorX = (longest.a.x + longest.b.x) / 2
    edge.anchorY = (longest.a.y + longest.b.y) / 2
    used.push(...segments)
  }
}
