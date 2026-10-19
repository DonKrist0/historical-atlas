import { parseSnapshot } from '../data/snapshot.ts'

export async function loadStaticPeople (baseUrl: string, fetcher: typeof fetch = fetch) {
  let response: Response
  try {
    response = await fetcher(`${baseUrl}data/people.json`, {
      credentials: 'omit', signal: AbortSignal.timeout(15_000), cache: 'no-cache',
    })
  } catch {
    throw new Error('Не удалось загрузить коллекцию. Проверьте подключение и повторите попытку.')
  }
  if (!response.ok) {
    throw new Error(`Файл коллекции недоступен (${response.status}). Повторите загрузку.`)
  }
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error('Не удалось прочитать JSON коллекции. Обновите файл и пересоберите сайт.')
  }
  return parseSnapshot(data)
}
