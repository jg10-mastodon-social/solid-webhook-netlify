import { describe, it, expect, vi, beforeAll } from 'vitest'
import type { Context } from '@netlify/functions'

vi.mock('../../src/base-url.js', () => ({
  baseUrl: 'http://localhost:9999'
}))

beforeAll(() => {
  process.env.WHITELISTED_ISSUERS = 'https://issuer.example'
  process.env.WEBHOOK_CONFIG_URL = 'https://pod.example.com/webhooks.ttl'
  process.env.WEBID = 'http://localhost:9999/webid'
  process.env.ISSUER = 'http://localhost:9999'
  process.env.HANDLER_BASE_URL = 'https://example.com/handlers#'
  process.env.SEND_TO_URL = 'http://localhost:9999/webhook'
})

vi.mock('@soid/core', () => ({
  getAuthenticatedFetch: vi.fn()
}))

function makeContext(overrides: Partial<Context> = {}): Context {
  return {
    requestId: 'test-request-id',
    server: { region: 'us-east-1' },
    waitUntil: vi.fn(),
    cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    geo: {},
    ip: '127.0.0.1',
    site: {},
    deploy: {},
    account: {},
    params: {},
    url: new URL('http://localhost/webhook'),
    next: vi.fn(),
    ...overrides
  } as Context
}

describe('webhook integration tests', () => {
  it('returns 401 without authorization header', async () => {
    const { default: handler } = await import('../../netlify/functions/webhook.mts')
    const req = new Request('http://localhost/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    })
    const res = await handler(req, makeContext())

    expect(res.status).toBe(401)
    expect(await res.text()).toBe('Authorization required')
  })

  it('returns 401 without DPoP header', async () => {
    const { default: handler } = await import('../../netlify/functions/webhook.mts')
    const req = new Request('http://localhost/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'DPoP some-token'
      }
    })
    const res = await handler(req, makeContext())

    expect(res.status).toBe(401)
    expect(await res.text()).toBe('DPoP header required')
  })

  it('returns 401 with invalid token format', async () => {
    const { default: handler } = await import('../../netlify/functions/webhook.mts')
    const req = new Request('http://localhost/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'DPoP invalid-token',
        'dpop': 'invalid-dpop'
      }
    })
    const res = await handler(req, makeContext())

    expect(res.status).toBe(401)
  })

  it('returns 204 for OPTIONS preflight', async () => {
    const { default: handler } = await import('../../netlify/functions/webhook.mts')
    const req = new Request('http://localhost/webhook', {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, DPoP'
      }
    })
    const res = await handler(req, makeContext())

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})