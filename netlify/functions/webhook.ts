import { verifyDpopToken } from '../../src/auth.js'
import { loadConfig } from '../../src/config.js'
import { createSolidFetch } from '../../src/solidFetch.js'

interface HttpEvent {
  headers: Record<string, string | undefined>
  httpMethod: string
  path: string
  queryStringParameters?: Record<string, string>
  body?: string
}

interface HttpResponse {
  statusCode: number
  headers?: Record<string, string>
  body: string
}

export const handler = async (event: HttpEvent): Promise<HttpResponse> => {
  console.log('[webhook] Received request')

  const config = loadConfig()

  const authHeader = event.headers.authorization
  const dpopHeader = event.headers.dpop

  const authResult = await verifyDpopToken(
    authHeader,
    dpopHeader,
    config.sendToUrl,
    'POST',
    config.whitelistedIssuers
  )

  if (!authResult.success) {
    console.log(`[webhook] Auth failed: ${authResult.message}`)
    return {
      statusCode: authResult.statusCode,
      body: authResult.message
    }
  }

  console.log(`[webhook] Token verified for webid: ${authResult.payload.webid}`)

  try {
    const fetchFn = await createSolidFetch(config.webId, config.issuer)
    
    console.log(`[webhook] Fetching config from ${config.webhookConfigUrl}`)
    const response = await fetchFn(config.webhookConfigUrl, {
      headers: { accept: 'text/turtle,application/x-turtle' }
    })

    if (!response.ok) {
      console.error(`[webhook] Config fetch failed: ${response.status}`)
      return {
        statusCode: 500,
        body: `Failed to fetch config: ${response.status}`
      }
    }

    console.log(`[webhook] Config fetched successfully`)
    return {
      statusCode: 200,
      body: 'ok'
    }
  } catch (error) {
    console.error(`[webhook] Error: ${error}`)
    return {
      statusCode: 500,
      body: error instanceof Error ? error.message : 'Internal error'
    }
  }
}