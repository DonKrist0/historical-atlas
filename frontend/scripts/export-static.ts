import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseSnapshot } from '../src/data/snapshot.ts'

const source = process.argv[2] ?? 'http://localhost:3000'
let data: unknown
if (/^https?:\/\//i.test(source)) {
  const url = new URL(source)
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/people`
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) {
    throw new Error(`Не удалось выгрузить коллекцию: HTTP ${response.status}`)
  }
  data = await response.json()
} else {
  data = JSON.parse(await readFile(source, 'utf8'))
}
const people = parseSnapshot(data)
const directory = new URL('../public/data/', import.meta.url)
const destination = new URL('people.json', directory)
const temporary = new URL('people.json.tmp', directory)
await mkdir(directory, { recursive: true })
await writeFile(temporary, `${JSON.stringify(people, null, 2)}\n`, 'utf8')
await rename(temporary, destination)
console.log(`Выгружено персон: ${people.length}. Файл: ${fileURLToPath(destination)}`)
