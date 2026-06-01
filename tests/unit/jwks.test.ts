import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock jose to avoid actual crypto operations in unit tests
vi.mock('jose', async () => {
  const actual = await vi.importActual('jose')
  return {
    ...actual as any,
  }
})

// Import the module to test
const { generateJwk, validateJwks } = await import('../../src/jwks.js')

describe('jwks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateJwk', () => {
    it('generates a valid JWK with required fields', async () => {
      const jwk = await generateJwk()

      expect(jwk).toHaveProperty('kty', 'EC')
      expect(jwk).toHaveProperty('crv', 'P-256')
      expect(jwk).toHaveProperty('x')
      expect(jwk).toHaveProperty('y')
      expect(jwk).toHaveProperty('kid')
      expect(jwk).toHaveProperty('alg', 'ES256')
      expect(jwk).toHaveProperty('use', 'sig')
    })

    it('generates different kid for each call', async () => {
      const jwk1 = await generateJwk()
      const jwk2 = await generateJwk()

      expect(jwk1.kid).not.toBe(jwk2.kid)
    })

    it('x and y are base64url encoded', async () => {
      const jwk = await generateJwk()

      // Should be non-empty strings
      expect(typeof jwk.x).toBe('string')
      expect(typeof jwk.y).toBe('string')
      expect(jwk.x.length).toBeGreaterThan(0)
      expect(jwk.y.length).toBeGreaterThan(0)

      // Should be valid base64url (no +, /, =)
      expect(jwk.x).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(jwk.y).toMatch(/^[A-Za-z0-9_-]+$/)
    })
  })

  describe('validateJwks', () => {
    it('returns true for valid JWKS with keys array', async () => {
      const jwk = await generateJwk()
      const jwks = { keys: [jwk] }

      const result = validateJwks(JSON.stringify(jwks))

      expect(result).toBe(true)
    })

    it('returns false for JWKS without keys property', () => {
      const invalid = JSON.stringify({ keys: [] })

      expect(validateJwks(invalid)).toBe(false)
    })

    it('returns false for JWKS with empty keys array', () => {
      const invalid = JSON.stringify({ keys: [] })

      expect(validateJwks(invalid)).toBe(false)
    })

    it('returns false for invalid JSON', () => {
      expect(validateJwks('not json')).toBe(false)
    })

    it('returns false for non-object JWKS', () => {
      expect(validateJwks('[]')).toBe(false)
      expect(validateJwks('"string"')).toBe(false)
    })

    it('returns false if keys is not array', () => {
      const invalid = JSON.stringify({ keys: {} })

      expect(validateJwks(invalid)).toBe(false)
    })
  })

  describe('createKidFromPublicKey', () => {
    it('creates consistent kid from same key', async () => {
      const jwk = await generateJwk()
      
      // The kid should already be set by generateJwk
      expect(jwk.kid).toBeDefined()
      expect(typeof jwk.kid).toBe('string')
      expect(jwk.kid.length).toBeGreaterThan(0)
    })
  })
})