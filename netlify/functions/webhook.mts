import type { Config, Context } from '@netlify/functions'
import { verifyDpopToken } from '../../src/auth.js'
import { loadConfig } from '../../src/config.js'
import { createSolidFetch } from '../../src/solidFetch.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, DPoP, Content-Type',
}

export const config: Config = {
  path: '/webhook',
  method: ['POST', 'OPTIONS'],
}

export default async (req: Request, context: Context) => {
  console.log('[webhook] Received request')

  if (req.method === 'OPTIONS') {
    console.log('[webhook] Handling CORS preflight')
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const config = loadConfig()

  const authHeader = req.headers.get('authorization')
  const dpopHeader = req.headers.get('dpop')

  const authResult = await verifyDpopToken(
    authHeader ?? undefined,
    dpopHeader ?? undefined,
    config.sendToUrl,
    'POST',
    config.whitelistedIssuers
  )

  if (!authResult.success) {
    console.log(`[webhook] Auth failed: ${authResult.message}`)
    return new Response(authResult.message, { 
      status: authResult.statusCode,
      headers: CORS_HEADERS 
    })
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
      return new Response(`Failed to fetch config: ${response.status}`, { 
        status: 500,
        headers: CORS_HEADERS
      })
    }

    console.log(`[webhook] Config fetched successfully`)
    return new Response('ok', { status: 200, headers: CORS_HEADERS })
  } catch (error) {
    console.error(`[webhook] Error: ${error}`)
    return new Response(error instanceof Error ? error.message : 'Internal error', { 
      status: 500,
      headers: CORS_HEADERS
    })
  }
}