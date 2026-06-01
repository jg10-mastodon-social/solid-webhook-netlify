import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import { readFileSync } from 'fs'

let devServer: ChildProcess

const DEV_PORT = 9999
const DEV_URL = `http://localhost:${DEV_PORT}`

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex)
      const value = trimmed.slice(eqIndex + 1)
      result[key] = value
    }
  }
  return result
}

async function waitForServer(url: string, timeout: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`${url}/.netlify/functions/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' } })
      if (response.status === 401 || response.status === 403 || response.status === 500) {
        return // server is up
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Server failed to start within ${timeout}ms`)
}

describe('webhook integration', () => {
  beforeAll(async () => {
    console.log('Starting netlify functions:serve...')

    // Load test env vars
    const testEnv = parseEnvFile(readFileSync('.env.test', 'utf-8'))
    console.log('Test env loaded:', Object.keys(testEnv))

    // Generate identity files for test
    const genEnv = { ...process.env, ...testEnv, GENERATE_TEST_IDENTITY: 'true' }
    const genProcess = spawn('node', ['scripts/generate-identity.ts'], {
      stdio: 'pipe',
      env: genEnv
    })
    
    await new Promise<void>((resolve) => {
      genProcess.on('close', (code) => {
        console.log(`Identity generation exited with code ${code}`)
        resolve()
      })
    })

    // Run tsc to compile
    console.log('Running TypeScript build...')
    const tscProcess = spawn('npx', ['tsc'], {
      stdio: 'pipe',
      env: { ...process.env, ...testEnv }
    })
    await new Promise<void>((resolve) => {
      tscProcess.on('close', (code) => {
        console.log(`tsc exited with code ${code}`)
        resolve()
      })
    })

    // Start netlify functions:serve (standalone function server)
    devServer = spawn('npx', ['netlify', 'functions:serve', '--port', String(DEV_PORT)], {
      stdio: 'pipe',
      env: { ...process.env, ...testEnv }
    })

    let netlifyOutput = ''
    devServer.stdout?.on('data', (data) => {
      const text = data.toString()
      netlifyOutput += text
      console.log(`[netlify] ${text.trim()}`)
    })

    devServer.stderr?.on('data', (data) => {
      const text = data.toString()
      netlifyOutput += text
      console.error(`[netlify] ${text.trim()}`)
    })

    try {
      console.log('Waiting for server to start...')
      await waitForServer(DEV_URL, 30000)
      console.log('Server is ready')
    } catch (error) {
      console.error('Server failed to start. Output:')
      console.error(netlifyOutput)
      throw error
    }
  }, 60000)

  afterAll(() => {
    if (devServer) {
      console.log('Stopping netlify functions:serve...')
      devServer.kill()
    }
  })

  it('returns 401 without authorization header', async () => {
    const response = await fetch(`${DEV_URL}/.netlify/functions/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    })

    expect(response.status).toBe(401)
    const text = await response.text()
    expect(text).toBe('Authorization required')
  })

  it('returns 401 without DPoP header', async () => {
    const response = await fetch(`${DEV_URL}/.netlify/functions/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'DPoP dummy-token'
      }
    })

    expect(response.status).toBe(401)
    const text = await response.text()
    expect(text).toBe('DPoP header required')
  })

  it('returns 401 with invalid token', async () => {
    const response = await fetch(`${DEV_URL}/.netlify/functions/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'DPoP invalid-token',
        'dpop': 'invalid-dpop'
      }
    })

    expect(response.status).toBe(401)
  })
})