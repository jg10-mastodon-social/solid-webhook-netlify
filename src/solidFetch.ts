import { importJWK, calculateJwkThumbprint, SignJWT } from 'jose'
import { buildAuthenticatedFetch, generateDpopKeyPair } from '@inrupt/solid-client-authn-core'
import { randomUUID } from 'node:crypto'
import type { SolidFetch } from './types.js'
// @ts-ignore
import { privateKey } from './private-key.js'

export async function createSolidFetch(webId: string, issuer: string): Promise<SolidFetch> {
  const privateKeyObject = await importJWK(privateKey, 'ES256')
  const dpopKey = await generateDpopKeyPair()
  const jkt = await calculateJwkThumbprint(dpopKey.publicKey, 'sha256')

  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({
    webid: webId,
    sub: webId,
    cnf: { jkt },
  })
    .setProtectedHeader({ alg: 'ES256', typ: 'at+jwt', kid: privateKey.kid })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setAudience('solid')
    .setIssuer(issuer)
    .setJti(randomUUID())
    .sign(privateKeyObject)

  return buildAuthenticatedFetch(token, { dpopKey }) as unknown as SolidFetch
}