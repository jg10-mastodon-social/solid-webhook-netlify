import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../..')
const baseUrlPath = path.join(rootDir, 'src/base-url.ts')
const privateKeyPath = path.join(rootDir, 'src/private-key.ts')

async function runScript(jwks?: string, context?: string): Promise<{ exitCode: number, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    const env: Record<string, string | undefined> = {
      ...process.env,
    }
    if (context === 'production') {
      env.CONTEXT = 'production'
      env.URL = 'https://example.com'
      delete env.DEPLOY_URL
    } else if (context === 'deploy-preview') {
      env.CONTEXT = 'deploy-preview'
      env.DEPLOY_URL = 'https://deploy-preview-123.netlify.app'
      delete env.URL
    } else {
      env.CONTEXT = 'dev'
      env.URL = 'http://localhost:9999'
      delete env.DEPLOY_URL
    }
    if (jwks) {
      env.JWKS = jwks
    }

    if (fs.existsSync(baseUrlPath)) {
      fs.unlinkSync(baseUrlPath)
    }

    const child = spawn('node', [path.join(__dirname, '../../scripts/generate-identity.ts')], {
      env,
      stdio: 'pipe',
    })

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (data) => { stdout += data.toString() })
    child.stderr?.on('data', (data) => { stderr += data.toString() })
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 0, stdout, stderr })
    })
  })
}

describe('generate-identity', () => {
  const publicDir = path.join(rootDir, 'public')
  const envPath = path.join(rootDir, '.env')

  beforeEach(() => {
    if (fs.existsSync(publicDir)) {
      fs.rmSync(publicDir, { recursive: true, force: true })
    }
    if (fs.existsSync(envPath)) {
      fs.unlinkSync(envPath)
    }
    if (fs.existsSync(baseUrlPath)) {
      fs.unlinkSync(baseUrlPath)
    }
    if (fs.existsSync(privateKeyPath)) {
      fs.unlinkSync(privateKeyPath)
    }
  })

  afterEach(() => {
    if (fs.existsSync(publicDir)) {
      fs.rmSync(publicDir, { recursive: true, force: true })
    }
    if (fs.existsSync(envPath)) {
      fs.unlinkSync(envPath)
    }
    if (fs.existsSync(baseUrlPath)) {
      fs.unlinkSync(baseUrlPath)
    }
    if (fs.existsSync(privateKeyPath)) {
      fs.unlinkSync(privateKeyPath)
    }
  })

  describe('with CONTEXT=production', () => {
    it('uses URL env var', async () => {
      const result = await runScript(undefined, 'production')
      expect(result.exitCode).toBe(0)

      const content = fs.readFileSync(baseUrlPath, 'utf-8')
      expect(content).toContain("export const baseUrl = 'https://example.com'")
    })

    it('writes webid using URL', async () => {
      await runScript(undefined, 'production')

      const webidPath = path.join(publicDir, 'webid')
      expect(fs.existsSync(webidPath)).toBe(true)
      const content = fs.readFileSync(webidPath, 'utf-8')
      expect(content).toContain('https://example.com/webid')
    })

    it('writes openid-configuration using URL', async () => {
      await runScript(undefined, 'production')

      const openidPath = path.join(publicDir, '.well-known', 'openid-configuration')
      expect(fs.existsSync(openidPath)).toBe(true)
      const content = JSON.parse(fs.readFileSync(openidPath, 'utf-8'))
      expect(content.issuer).toBe('https://example.com')
      expect(content.authorization_endpoint).toBe('https://example.com/authorize')
      expect(content.token_endpoint).toBe('https://example.com/token')
      expect(content.jwks_uri).toBe('https://example.com/jwks.json')
    })
  })

  describe('with CONTEXT=deploy-preview', () => {
    it('uses DEPLOY_URL env var', async () => {
      const result = await runScript(undefined, 'deploy-preview')
      expect(result.exitCode).toBe(0)

      const content = fs.readFileSync(baseUrlPath, 'utf-8')
      expect(content).toContain("export const baseUrl = 'https://deploy-preview-123.netlify.app'")
    })

    it('writes webid using DEPLOY_URL', async () => {
      await runScript(undefined, 'deploy-preview')

      const webidPath = path.join(publicDir, 'webid')
      expect(fs.existsSync(webidPath)).toBe(true)
      const content = fs.readFileSync(webidPath, 'utf-8')
      expect(content).toContain('https://deploy-preview-123.netlify.app/webid')
    })

    it('writes openid-configuration using DEPLOY_URL', async () => {
      await runScript(undefined, 'deploy-preview')

      const openidPath = path.join(publicDir, '.well-known', 'openid-configuration')
      expect(fs.existsSync(openidPath)).toBe(true)
      const content = JSON.parse(fs.readFileSync(openidPath, 'utf-8'))
      expect(content.issuer).toBe('https://deploy-preview-123.netlify.app')
      expect(content.authorization_endpoint).toBe('https://deploy-preview-123.netlify.app/authorize')
      expect(content.token_endpoint).toBe('https://deploy-preview-123.netlify.app/token')
      expect(content.jwks_uri).toBe('https://deploy-preview-123.netlify.app/jwks.json')
    })
  })

  describe('when JWKS env var is not set', () => {
    it('exits successfully', async () => {
      const result = await runScript()
      expect(result.exitCode).toBe(0)
      expect(result.stderr).not.toContain('Error')
    })

    it('generates new key pair', async () => {
      await runScript()

      expect(fs.existsSync(privateKeyPath)).toBe(true)
      const content = fs.readFileSync(privateKeyPath, 'utf-8')
      expect(content).toContain('export const privateKey')
    })

    it('writes public/jwks.json', async () => {
      await runScript()

      const jwksPath = path.join(publicDir, 'jwks.json')
      expect(fs.existsSync(jwksPath)).toBe(true)

      const jwks = JSON.parse(fs.readFileSync(jwksPath, 'utf-8'))
      expect(jwks).toHaveProperty('keys')
      expect(Array.isArray(jwks.keys)).toBe(true)
      expect(jwks.keys.length).toBe(1)
      expect(jwks.keys[0]).toHaveProperty('kty', 'EC')
      expect(jwks.keys[0]).toHaveProperty('crv', 'P-256')
      expect(jwks.keys[0]).toHaveProperty('x')
      expect(jwks.keys[0]).toHaveProperty('y')
      expect(jwks.keys[0]).not.toHaveProperty('d')
    })

    it('writes public/webid', async () => {
      await runScript()

      const webidPath = path.join(publicDir, 'webid')
      expect(fs.existsSync(webidPath)).toBe(true)
      const content = fs.readFileSync(webidPath, 'utf-8')
      expect(content).toContain('http://localhost:9999/webid')
    })
  })

  describe('when JWKS env var is set', () => {
    it('exits successfully when kid is present', async () => {
      const existingJwks = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'Ume6Ll4M4KINn10XYvKcRwdowi7P2lYTQpI41aBg3qc', y: '0v4HYYHF-UB61yiS2RxgXnbCaW7C82GvpauQS0ScTBU', d: 'test-d', alg: 'ES256', use: 'sig', kid: 'test-kid' })
      const result = await runScript(existingJwks)
      expect(result.exitCode).toBe(0)
    })

    it('fails when kid is missing', async () => {
      const existingJwks = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'Ume6Ll4M4KINn10XYvKcRwdowi7P2lYTQpI41aBg3qc', y: '0v4HYYHF-UB61yiS2RxgXnbCaW7C82GvpauQS0ScTBU', d: 'test-d', alg: 'ES256', use: 'sig' })
      const result = await runScript(existingJwks)
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('kid')
    })

    it('does not write to .env', async () => {
      const existingJwks = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'test-x', y: 'test-y', d: 'test-d', alg: 'ES256', use: 'sig', kid: 'test-kid' })

      fs.writeFileSync(envPath, 'EXISTING=value\n')

      await runScript(existingJwks)

      const envContent = fs.readFileSync(envPath, 'utf-8')
      expect(envContent).toBe('EXISTING=value\n')
    })

    it('writes private key to src/private-key.ts', async () => {
      const existingJwks = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'Ume6Ll4M4KINn10XYvKcRwdowi7P2lYTQpI41aBg3qc', y: '0v4HYYHF-UB61yiS2RxgXnbCaW7C82GvpauQS0ScTBU', d: 'test-d', alg: 'ES256', use: 'sig', kid: 'my-test-kid' })
      await runScript(existingJwks)

      expect(fs.existsSync(privateKeyPath)).toBe(true)
      const content = fs.readFileSync(privateKeyPath, 'utf-8')
      expect(content).toContain('export const privateKey')
    })

    it('writes public/jwks.json using kid from JWKS', async () => {
      const existingJwks = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'Ume6Ll4M4KINn10XYvKcRwdowi7P2lYTQpI41aBg3qc', y: '0v4HYYHF-UB61yiS2RxgXnbCaW7C82GvpauQS0ScTBU', d: 'test-d', alg: 'ES256', use: 'sig', kid: 'my-test-kid' })
      await runScript(existingJwks)

      const jwksPath = path.join(publicDir, 'jwks.json')
      expect(fs.existsSync(jwksPath)).toBe(true)

      const jwks = JSON.parse(fs.readFileSync(jwksPath, 'utf-8'))
      expect(jwks.keys[0]).toHaveProperty('x', 'Ume6Ll4M4KINn10XYvKcRwdowi7P2lYTQpI41aBg3qc')
      expect(jwks.keys[0]).toHaveProperty('y', '0v4HYYHF-UB61yiS2RxgXnbCaW7C82GvpauQS0ScTBU')
      expect(jwks.keys[0]).not.toHaveProperty('d')
      expect(jwks.keys[0]).toHaveProperty('kid', 'my-test-kid')
    })
  })

  describe('new key generation', () => {
    it('generates kid as SHA-256 hash of public key', async () => {
      await runScript()

      const jwksPath = path.join(publicDir, 'jwks.json')
      const jwks = JSON.parse(fs.readFileSync(jwksPath, 'utf-8'))

      expect(jwks.keys[0]).toHaveProperty('kid')
      expect(jwks.keys[0].kid).toBeDefined()
      expect(typeof jwks.keys[0].kid).toBe('string')
      expect(jwks.keys[0].kid.length).toBeGreaterThan(10)
    })

    it('writes private key with same kid to src/private-key.ts', async () => {
      await runScript()

      const jwksPath = path.join(publicDir, 'jwks.json')
      const jwks = JSON.parse(fs.readFileSync(jwksPath, 'utf-8'))
      const expectedKid = jwks.keys[0].kid

      const content = fs.readFileSync(privateKeyPath, 'utf-8')
      expect(content).toContain(`"kid":"${expectedKid}"`)
    })
  })
})