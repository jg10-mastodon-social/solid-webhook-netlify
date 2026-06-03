import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'

let devServer: ChildProcess

const DEV_PORT = 9999
const DEV_URL = `http://localhost:${DEV_PORT}`

async function waitForServer(url: string, timeout: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`${url}/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' }
      })
      if (response.status === 401 || response.status === 403 || response.status === 500) {
        return // server is up
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Server failed to start within ${timeout}ms`)
}

describe('webhook e2e tests', () => {
  beforeAll(async () => {
    console.log('Starting netlify dev...')

    devServer = spawn('npx', ['netlify', 'dev', '--context', 'dev', '--port', String(DEV_PORT)], {
      stdio: 'pipe'
    })

    let output = ''
    devServer.stdout?.on('data', (data) => {
      const text = data.toString()
      output += text
      console.log(`[netlify] ${text.trim()}`)
    })
    devServer.stderr?.on('data', (data) => {
      const text = data.toString()
      output += text
      console.error(`[netlify] ${text.trim()}`)
    })

    try {
      console.log('Waiting for server...')
      await waitForServer(DEV_URL, 30000)
      console.log('Server is ready')
    } catch (error) {
      console.error('Server failed to start. Output:', output)
      throw error
    }
  }, 60000)

  afterAll(() => {
    if (devServer) {
      console.log('Stopping netlify dev...')
      devServer.kill()
    }
  })

  it('returns 401 without authorization header', async () => {
    const res = await fetch(`${DEV_URL}/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    })

    expect(res.status).toBe(401)
    expect(await res.text()).toBe('Authorization required')
  })

  it('returns 401 without DPoP header', async () => {
    const res = await fetch(`${DEV_URL}/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'DPoP dummy-token'
      }
    })

    expect(res.status).toBe(401)
    expect(await res.text()).toBe('DPoP header required')
  })

  it('returns 401 with invalid token', async () => {
    const res = await fetch(`${DEV_URL}/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'DPoP invalid-token',
        'dpop': 'invalid-dpop'
      }
    })

    expect(res.status).toBe(401)
  })

  it('returns 204 for OPTIONS preflight with CORS headers', async () => {
    const res = await fetch(`${DEV_URL}/webhook`, {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, DPoP'
      }
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS')
  })

  it('returns JWKS from public/jwks.json', async () => {
    const res = await fetch(`${DEV_URL}/jwks.json`)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')?.startsWith('application/json')).toBe(true)

    const jwks = await res.json()
    expect(jwks).toHaveProperty('keys')
    expect(Array.isArray(jwks.keys)).toBe(true)
    expect(jwks.keys.length).toBeGreaterThan(0)

    const key = jwks.keys[0]
    expect(key).toHaveProperty('kty', 'EC')
    expect(key).toHaveProperty('crv', 'P-256')
    expect(key).toHaveProperty('x')
    expect(key).toHaveProperty('y')
    expect(key).toHaveProperty('kid')
    expect(key).toHaveProperty('alg', 'ES256')
    expect(key).toHaveProperty('use', 'sig')

    // Should NOT contain private key fields
    expect(key).not.toHaveProperty('d')
    expect(key).not.toHaveProperty('dp')
    expect(key).not.toHaveProperty('dq')
    expect(key).not.toHaveProperty('p')
    expect(key).not.toHaveProperty('q')
  })

  it('returns 500 when config fetch fails with 404', async () => {
    const { importJWK, SignJWT, calculateJwkThumbprint, generateKeyPair, exportJWK } = await import('jose')
    const { randomUUID, createHash } = await import('crypto')
    // @ts-ignore
    const { privateKey: identityKey } = await import('../../src/private-key.js')

    const identityPrivateKey = await importJWK(identityKey, 'ES256')
    const identityKid = identityKey.kid

    const dpopKeyPair = await generateKeyPair('ES256', { crv: 'P-256' })
    const dpopPublicJwk = await exportJWK(dpopKeyPair.publicKey)
    dpopPublicJwk.kid = createHash('sha256')
      .update(JSON.stringify(dpopPublicJwk))
      .digest('base64url')
    dpopPublicJwk.alg = 'ES256'
    const jkt = await calculateJwkThumbprint(dpopPublicJwk, 'sha256')

    const now = Math.floor(Date.now() / 1000)

    const token = await new SignJWT({
      webid: 'http://localhost:9999/webid',
      sub: 'http://localhost:9999/webid',
      cnf: { jkt },
    })
      .setProtectedHeader({ alg: 'ES256', typ: 'at+jwt', kid: identityKid })
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .setAudience('solid')
      .setIssuer('http://localhost:9999')
      .setJti(randomUUID())
      .sign(identityPrivateKey)

    const dpopHeader = await new SignJWT({
      htu: 'http://localhost:9999/webhook',
      htm: 'POST',
      jti: randomUUID(),
    })
      .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk: dpopPublicJwk })
      .setIssuedAt(now)
      .sign(dpopKeyPair.privateKey)

    const res = await fetch(`${DEV_URL}/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `DPoP ${token}`,
        'dpop': dpopHeader
      }
    })

    expect(res.status).toBe(500)
    expect(await res.text()).toContain('404')
  })
})