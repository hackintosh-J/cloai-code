import { getStoredUser, jsonRequest, redirectToLogin } from './http/apiClient'

export async function sendCode(email: string) {
  return jsonRequest('/auth/send-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function register(email: string, password: string, nickname: string, code: string) {
  return jsonRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, nickname, code }),
  })
}

export async function login(email: string, password: string) {
  return jsonRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function forgotPassword(email: string) {
  return jsonRequest('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function resetPassword(email: string, code: string, password: string) {
  return jsonRequest('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, code, password }),
  })
}

export function logout() {
  redirectToLogin()
}

export function getUser() {
  return getStoredUser()
}

export async function getUserProfile() {
  return { user: getStoredUser() || {} }
}

export async function updateUserProfile(data: Record<string, any>) {
  const updated = { ...(getStoredUser() || {}), ...data }
  localStorage.setItem('user', JSON.stringify(updated))
  return updated
}
