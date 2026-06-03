import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../..')
const baseUrlPath = path.join(rootDir, 'src/base-url.ts')

describe('loadConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    fs.writeFileSync(baseUrlPath, "export const baseUrl = 'https://mocked.example.com'\n")
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    if (fs.existsSync(baseUrlPath)) {
      fs.unlinkSync(baseUrlPath)
    }
  })

  it('uses baseUrl from base-url module', async () => {
    process.env.WHITELISTED_ISSUERS = 'https://mocked.example.com'
    process.env.WEBHOOK_CONFIG_URL = 'https://mocked.example.com/webhooks.ttl'
    process.env.HANDLER_BASE_URL = 'https://mocked.example.com/handlers#'

    const { loadConfig } = await import('../../src/config.js')
    const config = loadConfig()

    expect(config.baseUrl).toBe('https://mocked.example.com')
    expect(config.webId).toBe('https://mocked.example.com/webid')
    expect(config.issuer).toBe('https://mocked.example.com')
    expect(config.sendToUrl).toBe('https://mocked.example.com/webhook')
  })

  it('derives webId from baseUrl if WEBID is not set', async () => {
    delete process.env.WEBID
    process.env.WHITELISTED_ISSUERS = 'https://mocked.example.com'
    process.env.WEBHOOK_CONFIG_URL = 'https://mocked.example.com/webhooks.ttl'
    process.env.HANDLER_BASE_URL = 'https://mocked.example.com/handlers#'

    const { loadConfig } = await import('../../src/config.js')
    const config = loadConfig()

    expect(config.webId).toBe('https://mocked.example.com/webid')
  })

  it('derives issuer from baseUrl if ISSUER is not set', async () => {
    delete process.env.ISSUER
    process.env.WHITELISTED_ISSUERS = 'https://mocked.example.com'
    process.env.WEBHOOK_CONFIG_URL = 'https://mocked.example.com/webhooks.ttl'
    process.env.HANDLER_BASE_URL = 'https://mocked.example.com/handlers#'

    const { loadConfig } = await import('../../src/config.js')
    const config = loadConfig()

    expect(config.issuer).toBe('https://mocked.example.com')
  })

  it('derives sendToUrl from baseUrl if SEND_TO_URL is not set', async () => {
    delete process.env.SEND_TO_URL
    process.env.WHITELISTED_ISSUERS = 'https://mocked.example.com'
    process.env.WEBHOOK_CONFIG_URL = 'https://mocked.example.com/webhooks.ttl'
    process.env.HANDLER_BASE_URL = 'https://mocked.example.com/handlers#'

    const { loadConfig } = await import('../../src/config.js')
    const config = loadConfig()

    expect(config.sendToUrl).toBe('https://mocked.example.com/webhook')
  })

  it('throws when WHITELISTED_ISSUERS is missing', async () => {
    delete process.env.WHITELISTED_ISSUERS
    process.env.WEBHOOK_CONFIG_URL = 'https://mocked.example.com/webhooks.ttl'
    process.env.HANDLER_BASE_URL = 'https://mocked.example.com/handlers#'

    const { loadConfig } = await import('../../src/config.js')

    expect(() => loadConfig()).toThrow('WHITELISTED_ISSUERS is required')
  })

  it('throws when WEBHOOK_CONFIG_URL is missing', async () => {
    delete process.env.WEBHOOK_CONFIG_URL
    process.env.WHITELISTED_ISSUERS = 'https://mocked.example.com'
    process.env.HANDLER_BASE_URL = 'https://mocked.example.com/handlers#'

    const { loadConfig } = await import('../../src/config.js')

    expect(() => loadConfig()).toThrow('WEBHOOK_CONFIG_URL is required')
  })

  it('throws when HANDLER_BASE_URL is missing', async () => {
    delete process.env.HANDLER_BASE_URL
    process.env.WHITELISTED_ISSUERS = 'https://mocked.example.com'
    process.env.WEBHOOK_CONFIG_URL = 'https://mocked.example.com/webhooks.ttl'

    const { loadConfig } = await import('../../src/config.js')

    expect(() => loadConfig()).toThrow('HANDLER_BASE_URL is required')
  })

  it('parses comma-separated whitelisted issuers', async () => {
    process.env.WHITELISTED_ISSUERS = 'https://issuer1.example.com, https://issuer2.example.com ,https://issuer3.example.com'
    process.env.WEBHOOK_CONFIG_URL = 'https://mocked.example.com/webhooks.ttl'
    process.env.HANDLER_BASE_URL = 'https://mocked.example.com/handlers#'

    const { loadConfig } = await import('../../src/config.js')
    const config = loadConfig()

    expect(config.whitelistedIssuers).toEqual([
      'https://issuer1.example.com',
      'https://issuer2.example.com',
      'https://issuer3.example.com',
    ])
  })

  it('sets adminWebId from ADMIN_WEBID env var', async () => {
    process.env.ADMIN_WEBID = 'https://admin.example.com/webid#me'
    process.env.WHITELISTED_ISSUERS = 'https://mocked.example.com'
    process.env.WEBHOOK_CONFIG_URL = 'https://mocked.example.com/webhooks.ttl'
    process.env.HANDLER_BASE_URL = 'https://mocked.example.com/handlers#'

    const { loadConfig } = await import('../../src/config.js')
    const config = loadConfig()

    expect(config.adminWebId).toBe('https://admin.example.com/webid#me')
  })

  it('defaults adminWebId to empty string if not set', async () => {
    delete process.env.ADMIN_WEBID
    process.env.WHITELISTED_ISSUERS = 'https://mocked.example.com'
    process.env.WEBHOOK_CONFIG_URL = 'https://mocked.example.com/webhooks.ttl'
    process.env.HANDLER_BASE_URL = 'https://mocked.example.com/handlers#'

    const { loadConfig } = await import('../../src/config.js')
    const config = loadConfig()

    expect(config.adminWebId).toBe('')
  })
})