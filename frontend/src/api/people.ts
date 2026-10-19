import type { Person } from '../data/people'
import { isStatic } from '../config'
import { loadStaticPeople } from './staticPeople'

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export async function request<T> (path: string, options: RequestInit = {}): Promise<T> {
  if (isStatic) {
    throw new Error('Опубликованная коллекция доступна только для просмотра.')
  }
  let response: Response
  try {
    response = await fetch(`${baseUrl}/api${path}`, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Chronicle', ...options.headers },
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error('Сервер недоступен. Проверьте подключение и повторите попытку.')
  }
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new Event('chronicle-session-expired'))
    }
    const body = await response.json().catch(() => null)
    if (typeof body?.detail === 'string') {
      throw new TypeError(body.detail)
    }
    if (Array.isArray(body?.detail)) {
      throw new TypeError(body.detail.map((item: { loc?: (string | number)[], msg?: string }) =>
        `${item.loc?.slice(1).join('.') ?? ''}: ${item.msg ?? 'Некорректное значение'}`).join('; '))
    }
    throw new Error(`Не удалось выполнить запрос (${response.status}). Повторите попытку.`)
  }
  return response.json() as Promise<T>
}

export const peopleApi = {
  list: () => isStatic ? loadStaticPeople(import.meta.env.BASE_URL) : request<Person[]>('/people'),
  create: (person: Omit<Person, 'id' | 'relation'>) => request<Person>('/people', {
    method: 'POST', body: JSON.stringify(person),
  }),
  update: (id: string, person: Omit<Person, 'id' | 'relation'>) => request<Person>(`/people/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify(person),
  }),
  import: (people: Person[]) => request<Person[]>('/people/import', {
    method: 'POST', body: JSON.stringify({ people }),
  }),
}
