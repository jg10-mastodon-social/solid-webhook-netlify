import { importJWK, calculateJwkThumbprint, SignJWT } from 'jose'
import { buildAuthenticatedFetch, generateDpopKeyPair } from '@inrupt/solid-client-authn-core'
import { randomUUID } from 'node:crypto'
import type { SolidFetch } from './types.js'

let jwksPrivateKey: Awaited<ReturnType<typeof importJWK>> | undefined

async function getJwksPrivateKey() {
  if (!jwksPrivateKey) {
    const jwksEnv = process.env.JWKS
    if (!jwksEnv) {
      throw new Error('JWKS environment variable is required')
    }
    try {
      const jwks = JSON.parse(jwksEnv)
      jwksPrivateKey = await importJWK(jwks, 'ES256')
    } catch {
      throw new Error('Failed to parse JWKS environment variable')
    }
  }
  return jwksPrivateKey
}

export async function createSolidFetch(webId: string, issuer: string): Promise<SolidFetch> {
  const privateKey = await getJwksPrivateKey()
  const dpopKey = await generateDpopKeyPair()
  const jkt = await calculateJwkThumbprint(dpopKey.publicKey, 'sha256')

  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({
    webid: webId,
    sub: webId,
    cnf: { jkt },
  })
    .setProtectedHeader({ alg: 'ES256', typ: 'at+jwt' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setAudience('solid')
    .setIssuer(issuer)
    .setJti(randomUUID())
    .sign(privateKey)

  return buildAuthenticatedFetch(token, { dpopKey }) as unknown as SolidFetch
}