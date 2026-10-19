import { isStatic } from '../config'
import { request } from './people'

export interface Identity {
  username: string | null
  canEdit: boolean
}

export const authApi = {
  me: () => isStatic ? Promise.resolve<Identity>({ username: null, canEdit: false }) : request<Identity>('/auth/me'),
  login: (username: string, password: string) => request<Identity>('/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  }),
  logout: () => request<Identity>('/auth/logout', { method: 'POST' }),
}
