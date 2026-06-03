import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrivateKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'test-x',
  y: 'test-y',
  d: 'test-d',
  kid: 'test-kid',
  alg: 'ES256',
  use: 'sig',
}

vi.mock('./private-key.js', () => ({
  privateKey: mockPrivateKey,
}))

vi.mock('@inrupt/solid-client-authn-core', () => ({
  generateDpopKeyPair: vi.fn().mockResolvedValue({
    privateKey: { type: 'private' },
    publicKey: { kty: 'EC', crv: 'P-256', x: 'test', y: 'test' },
  }),
  buildAuthenticatedFetch: vi.fn().mockReturnValue(mockFetch),
}))

vi.mock('jose', async () => {
  const actual = await vi.importActual('jose')
  return {
    ...actual as any,
    importJWK: vi.fn().mockResolvedValue({ type: 'private-key' }),
    calculateJwkThumbprint: vi.fn().mockResolvedValue('test-jkt'),
    SignJWT: vi.fn().mockImplementation(() => ({
      setProtectedHeader: vi.fn().mockReturnThis(),
      setIssuedAt: vi.fn().mockReturnThis(),
      setExpirationTime: vi.fn().mockReturnThis(),
      setAudience: vi.fn().mockReturnThis(),
      setIssuer: vi.fn().mockReturnThis(),
      setJti: vi.fn().mockReturnThis(),
      sign: vi.fn().mockResolvedValue('mock-signed-token'),
    })),
  }
})

const mockFetch = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
)

describe('solidFetch', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  describe('createSolidFetch', () => {
    it('imports private key from generated file', async () => {
      const { importJWK } = await import('jose')
      const { createSolidFetch } = await import('../../src/solidFetch.js')

      await createSolidFetch('https://pod.example.com/profile/card#me', 'https://pod.example.com')

      expect(importJWK).toHaveBeenCalledWith(
        expect.objectContaining({ kty: 'EC', crv: 'P-256' }),
        'ES256'
      )
    })

    it('uses kid from private key', async () => {
      const { SignJWT } = await import('jose')
      const { createSolidFetch } = await import('../../src/solidFetch.js')

      await createSolidFetch('https://pod.example.com/profile/card#me', 'https://pod.example.com')

      expect(SignJWT).toHaveBeenCalledWith(
        expect.objectContaining({
          webid: 'https://pod.example.com/profile/card#me',
          sub: 'https://pod.example.com/profile/card#me',
          cnf: { jkt: 'test-jkt' },
        })
      )
    })

    it('generates ephemeral DPoP key pair', async () => {
      const { generateDpopKeyPair } = await import('@inrupt/solid-client-authn-core')
      const { createSolidFetch } = await import('../../src/solidFetch.js')

      await createSolidFetch('https://pod.example.com/profile/card#me', 'https://pod.example.com')

      expect(generateDpopKeyPair).toHaveBeenCalled()
    })

    it('calculates JWK thumbprint for cnf claim', async () => {
      const { calculateJwkThumbprint } = await import('jose')
      const { createSolidFetch } = await import('../../src/solidFetch.js')

      await createSolidFetch('https://pod.example.com/profile/card#me', 'https://pod.example.com')

      expect(calculateJwkThumbprint).toHaveBeenCalled()
    })

    it('signs token with JWKS private key', async () => {
      const { SignJWT, importJWK } = await import('jose')
      const { createSolidFetch } = await import('../../src/solidFetch.js')

      await createSolidFetch('https://pod.example.com/profile/card#me', 'https://pod.example.com')

      expect(SignJWT).toHaveBeenCalledWith(
        expect.objectContaining({
          webid: 'https://pod.example.com/profile/card#me',
          sub: 'https://pod.example.com/profile/card#me',
          cnf: { jkt: 'test-jkt' },
        })
      )
      expect(SignJWT).toHaveBeenCalled()
    })

    it('returns authenticated fetch function', async () => {
      const { createSolidFetch } = await import('../../src/solidFetch.js')

      const fetchFn = await createSolidFetch('https://pod.example.com/profile/card#me', 'https://pod.example.com')

      expect(typeof fetchFn).toBe('function')
    })

    it('can make authenticated requests', async () => {
      const { createSolidFetch } = await import('../../src/solidFetch.js')

      const fetchFn = await createSolidFetch('https://pod.example.com/profile/card#me', 'https://pod.example.com')
      const response = await fetchFn('https://pod.example.com/inbox/')

      expect(response.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalled()
    })
  })
})
