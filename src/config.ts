import type { Config } from './types.js'
import { baseUrl } from './base-url.js'

export interface EnvConfig {
  WEBID: string
  ISSUER: string
  WHITELISTED_ISSUERS: string
  WEBHOOK_CONFIG_URL: string
  HANDLER_BASE_URL: string
  SEND_TO_URL: string
  ADMIN_WEBID?: string
}

export function loadConfig(): Config {
  const whitelistedIssuersStr = process.env.WHITELISTED_ISSUERS
  if (!whitelistedIssuersStr) {
    throw new Error('WHITELISTED_ISSUERS is required')
  }
  if (!process.env.WEBHOOK_CONFIG_URL) {
    throw new Error('WEBHOOK_CONFIG_URL is required')
  }
  if (!process.env.HANDLER_BASE_URL) {
    throw new Error('HANDLER_BASE_URL is required')
  }

  const webId = process.env.WEBID || `${baseUrl}/webid`
  const issuer = process.env.ISSUER || baseUrl
  const webhookEndpoint = '/webhook'
  const sendToUrl = process.env.SEND_TO_URL || `${baseUrl}${webhookEndpoint}`
  const adminWebId = process.env.ADMIN_WEBID || ''
  const whitelistedIssuers = whitelistedIssuersStr.split(',').map((s) => s.trim())

  return {
    webId,
    issuer,
    baseUrl,
    webhookEndpoint,
    sendToUrl,
    whitelistedIssuers,
    webhookConfigUrl: process.env.WEBHOOK_CONFIG_URL,
    handlerBaseUrl: process.env.HANDLER_BASE_URL,
    adminWebId,
  }
}