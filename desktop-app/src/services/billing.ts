import { jsonRequest } from './http/apiClient'

export async function getPlans() {
  return jsonRequest('/payment/plans')
}

export async function createPaymentOrder(planId: number, paymentMethod: string) {
  return jsonRequest('/payment/create', {
    method: 'POST',
    body: JSON.stringify({ plan_id: planId, payment_method: paymentMethod }),
  })
}

export async function getPaymentStatus(orderId: string) {
  return jsonRequest(`/payment/status/${orderId}`)
}

export async function redeemCode(code: string) {
  return jsonRequest('/redemption/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}
