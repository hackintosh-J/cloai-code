import { APIError, APIConnectionError, APIUserAbortError } from '@anthropic-ai/sdk'

const e = new APIError(
  502,
  undefined,
  "Test error",
  new Headers() as any
)
console.log(e.status, e.message)
