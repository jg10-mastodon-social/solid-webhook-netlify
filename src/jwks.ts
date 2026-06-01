import { generateKeyPairSync, createHash } from 'crypto'
import { exportJWK, importJWK } from 'jose'

export interface Jwk {
  kty: string
  crv: string
  x: string
  y: string
  kid: string
  alg: string
  use: string
}

export async function generateJwk(): Promise<Jwk> {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  
  const jwk = await exportJWK(publicKey) as Jwk
  
  // Create kid as SHA-256 thumbprint
  const jwkJson = JSON.stringify(await exportJWK(publicKey))
  const thumbprint = createHash('sha256')
    .update(jwkJson)
    .digest('base64url')
  
  jwk.kid = thumbprint
  jwk.alg = 'ES256'
  jwk.use = 'sig'
  
  return jwk
}

export function validateJwks(jwksString: string): boolean {
  try {
    const parsed = JSON.parse(jwksString)
    
    if (typeof parsed !== 'object' || parsed === null) {
      return false
    }
    
    if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) {
      return false
    }
    
    for (const key of parsed.keys) {
      if (!key.kty || !key.crv || !key.x || !key.y || !key.kid) {
        return false
      }
    }
    
    return true
  } catch {
    return false
  }
}

export function createJwksString(keys: Jwk[]): string {
  return JSON.stringify({ keys })
}