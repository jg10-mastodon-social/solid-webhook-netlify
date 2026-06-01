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
})