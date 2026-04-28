import { jsonRequest } from './http/apiClient'

export async function getCodeSSO() {
  return jsonRequest('/code/sso')
}

export async function getCodeQuota() {
  return jsonRequest('/code/quota')
}

export async function getCodePlans() {
  return jsonRequest('/code/plans')
}
