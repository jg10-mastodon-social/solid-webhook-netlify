import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVerifyDpopToken = vi.fn()
const mockCreateSolidFetch = vi.fn()
const mockFetch = vi.fn()

vi.mock('../src/auth.js', () => ({
  verifyDpopToken: mockVerifyDpopToken
}))

vi.mock('@soid/core', () => ({
  getAuthenticatedFetch: mockCreateSolidFetch
}))

vi.mock('../src/config.js', () => ({
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

vi.mock('../src/solidFetch.js', () => ({
  createSolidFetch: mockCreateSolidFetch
}))

const { handler } = await import('../netlify/functions/webhook.js')

describe('webhook handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEvent = {
    headers: {
      authorization: 'DPoP valid-token',
      dpop: 'valid-dpop'
    },
    httpMethod: 'POST' as const,
    path: '/webhook'
  }

  it('returns 401 without authorization header', async () => {
    mockVerifyDpopToken.mockResolvedValue({
      success: false,
      statusCode: 401,
      message: 'Authorization required'
    })

    const response = await handler({
      ...mockEvent,
      headers: { dpop: 'some-dpop' }
    })

    expect(response.statusCode).toBe(401)
    expect(response.body).toBe('Authorization required')
  })

  it('returns 401 without DPoP header', async () => {
    mockVerifyDpopToken.mockResolvedValue({
      success: false,
      statusCode: 401,
      message: 'DPoP header required'
    })

    const response = await handler({
      ...mockEvent,
      headers: { authorization: 'DPoP some-token' }
    })

    expect(response.statusCode).toBe(401)
    expect(response.body).toBe('DPoP header required')
  })

  it('returns 401 for invalid token', async () => {
    mockVerifyDpopToken.mockResolvedValue({
      success: false,
      statusCode: 401,
      message: 'Token verification failed'
    })

    const response = await handler(mockEvent)

    expect(response.statusCode).toBe(401)
    expect(response.body).toBe('Token verification failed')
  })

  it('returns 403 for non-whitelisted issuer', async () => {
    mockVerifyDpopToken.mockResolvedValue({
      success: false,
      statusCode: 403,
      message: 'Issuer not allowed'
    })

    const response = await handler(mockEvent)

    expect(response.statusCode).toBe(403)
    expect(response.body).toBe('Issuer not allowed')
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

    const response = await handler(mockEvent)

    expect(response.statusCode).toBe(500)
    expect(response.body).toContain('Failed to fetch config')
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

    const response = await handler(mockEvent)

    expect(response.statusCode).toBe(200)
    expect(response.body).toBe('ok')
  })
})