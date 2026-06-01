import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@netlify/functions'

const mockVerifyDpopToken = vi.fn()
const mockCreateSolidFetch = vi.fn()
const mockFetch = vi.fn()

vi.mock('../../src/auth.js', () => ({
  verifyDpopToken: mockVerifyDpopToken
}))

vi.mock('../../src/config.js', () => ({
  loadConfig: () => ({
    webId: 'https://example.com/webid',
    issuer: 'https://example.com',
    baseUrl: 'https://example.com',
    webhookEndpoint: '/webhook',
    sendToUrl: 'https://example.com/webhook',
    whitelistedIssuers: ['https://issuer.example'],
    webhookConfigUrl: 'https://pod.example.com/webhooks.ttl',
    handlerBaseUrl: 'https://example.com/handlers#',
    adminWebId: ''
  })
}))

vi.mock('../../src/solidFetch.js', () => ({
  createSolidFetch: mockCreateSolidFetch
}))

const { default: handler } = await import('../../netlify/functions/webhook.mts')

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

describe('webhook unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without authorization header', async () => {
    mockVerifyDpopToken.mockResolvedValue({
      success: false,
      statusCode: 401,
      message: 'Authorization required'
    })

    const req = new Request('http://localhost/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    })
    const res = await handler(req, makeContext())

    expect(res.status).toBe(401)
    expect(await res.text()).toBe('Authorization required')
  })

  it('returns 401 without DPoP header', async () => {
    mockVerifyDpopToken.mockResolvedValue({
      success: false,
      statusCode: 401,
      message: 'DPoP header required'
    })

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

  it('returns 401 for invalid token', async () => {
    mockVerifyDpopToken.mockResolvedValue({
      success: false,
      statusCode: 401,
      message: 'Token verification failed'
    })

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
    expect(await res.text()).toBe('Token verification failed')
  })

  it('returns 403 for non-whitelisted issuer', async () => {
    mockVerifyDpopToken.mockResolvedValue({
      success: false,
      statusCode: 403,
      message: 'Issuer not allowed'
    })

    const req = new Request('http://localhost/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'DPoP valid-token',
        'dpop': 'valid-dpop'
      }
    })
    const res = await handler(req, makeContext())

    expect(res.status).toBe(403)
    expect(await res.text()).toBe('Issuer not allowed')
  })

  it('returns 500 when config fetch fails', async () => {
    mockVerifyDpopToken.mockResolvedValue({
      success: true,
      payload: { webid: 'https://example.com/webid#me', client_id: 'client1', iss: 'https://issuer.example', iat: 0, exp: 0 }
    })

    mockCreateSolidFetch.mockResolvedValue(mockFetch)
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404
    })

    const req = new Request('http://localhost/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'DPoP valid-token',
        'dpop': 'valid-dpop'
      }
    })
    const res = await handler(req, makeContext())

    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).toContain('Failed to fetch config')
  })

  it('returns 200 on success', async () => {
    mockVerifyDpopToken.mockResolvedValue({
      success: true,
      payload: { webid: 'https://example.com/webid#me', client_id: 'client1', iss: 'https://issuer.example', iat: 0, exp: 0 }
    })

    mockCreateSolidFetch.mockResolvedValue(mockFetch)
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200
    })

    const req = new Request('http://localhost/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'DPoP valid-token',
        'dpop': 'valid-dpop'
      }
    })
    const res = await handler(req, makeContext())

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('returns 204 for OPTIONS with CORS headers', async () => {
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
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS')
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, DPoP, Content-Type')
  })

  it('includes CORS headers on 401 response', async () => {
    mockVerifyDpopToken.mockResolvedValue({
      success: false,
      statusCode: 401,
      message: 'Authorization required'
    })

    const req = new Request('http://localhost/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    })
    const res = await handler(req, makeContext())

    expect(res.status).toBe(401)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('includes CORS headers on 200 response', async () => {
    mockVerifyDpopToken.mockResolvedValue({
      success: true,
      payload: { webid: 'https://example.com/webid#me', client_id: 'client1', iss: 'https://issuer.example', iat: 0, exp: 0 }
    })

    mockCreateSolidFetch.mockResolvedValue(mockFetch)
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200
    })

    const req = new Request('http://localhost/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'DPoP valid-token',
        'dpop': 'valid-dpop'
      }
    })
    const res = await handler(req, makeContext())

    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})