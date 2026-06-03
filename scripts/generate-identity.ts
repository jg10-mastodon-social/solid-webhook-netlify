import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateKeyPair, exportJWK, importJWK } from 'jose'
import { createHash } from 'node:crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const publicDir = path.join(rootDir, 'public')
const baseUrlPath = path.join(rootDir, 'src/base-url.ts')
const privateKeyPath = path.join(rootDir, 'src/private-key.ts')

const context = process.env.CONTEXT
let baseUrl: string | undefined

console.log("CONTEXT", context)
if (context === 'production') {
  baseUrl = process.env.URL
} else {
  baseUrl = process.env.DEPLOY_URL || process.env.URL
}

if (!baseUrl) {
  console.error('URL (for production) or DEPLOY_URL (for previews) is required')
  process.exit(1)
}

fs.writeFileSync(baseUrlPath, `export const baseUrl = '${baseUrl}'\n`)
console.log(`Written: ${baseUrlPath}`)

const webId = process.env.WEBID || `${baseUrl}/webid`
const issuer = process.env.ISSUER || baseUrl

function derivePublicJwk(privateJwk: Record<string, unknown>): Record<string, unknown> {
  if (!privateJwk.kid) {
    throw new Error('JWKS missing required kid field')
  }
  const { d, dp, dq, p, q, ...publicFields } = privateJwk
  return {
    ...publicFields,
    use: 'sig',
    alg: 'ES256',
    kid: privateJwk.kid,
  }
}

async function generateIdentity() {
  console.log(`Generating identity files`)
  console.log(`BASE_URL: ${baseUrl}`)
  console.log(`WEBID: ${webId}`)
  console.log(`ISSUER: ${issuer}`)

  let publicJwk: Record<string, unknown>
  let privateJwk: Record<string, unknown>

  const existingJwks = process.env.JWKS

  if (existingJwks) {
    console.log('Using existing JWKS from environment variable')
    const parsed = JSON.parse(existingJwks)
    if (!parsed.kid) {
      throw new Error('JWKS missing required kid field')
    }
    const importedKey = await importJWK(parsed, 'ES256')
    const fullJwk = await exportJWK(importedKey)
    privateJwk = { ...fullJwk, kid: parsed.kid }
    publicJwk = {
      kty: fullJwk.kty,
      crv: fullJwk.crv,
      x: fullJwk.x,
      y: fullJwk.y,
      use: 'sig',
      alg: 'ES256',
      kid: parsed.kid,
    }
  } else {
    console.log('Generating new key pair')
    const { publicKey, privateKey } = await generateKeyPair('ES256', { crv: 'P-256' })

    publicJwk = await exportJWK(publicKey)
    publicJwk.kid = createHash('sha256')
      .update(JSON.stringify(publicJwk))
      .digest('base64url')
    publicJwk.alg = 'ES256'
    publicJwk.use = 'sig'

    privateJwk = await exportJWK(privateKey)
    privateJwk.kid = publicJwk.kid
    privateJwk.alg = 'ES256'
    privateJwk.use = 'sig'
  }

  fs.mkdirSync(publicDir, { recursive: true })

  const jwksContent = JSON.stringify({ keys: [publicJwk] }, null, 2)
  const jwksPath = path.join(publicDir, 'jwks.json')
  fs.writeFileSync(jwksPath, jwksContent)
  console.log(`Written: ${jwksPath}`)

  const openidConfiguration = {
    issuer: issuer,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    jwks_uri: `${baseUrl}/jwks.json`,
    solid_oidc_supported: true,
    solid_oidc_version: '1.0.0'
  }

  const openidPath = path.join(publicDir, '.well-known', 'openid-configuration')
  fs.mkdirSync(path.dirname(openidPath), { recursive: true })
  fs.writeFileSync(openidPath, JSON.stringify(openidConfiguration, null, 2))
  console.log(`Written: ${openidPath}`)

  const webidTurtle = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
@prefix oidc: <http://www.w3.org/ns/solid/oidc#>.

<${webId}> a <http://www.w3.org/2005/Incubator/w3c/Alice/WebID/1.0#Agent>.
<${webId}> solid:oidcIssuer <${issuer}>.
`

  const webidPath = path.join(publicDir, 'webid')
  fs.writeFileSync(webidPath, webidTurtle)
  console.log(`Written: ${webidPath}`)

  fs.writeFileSync(privateKeyPath, `export const privateKey = ${JSON.stringify(privateJwk)}\n`)
  console.log(`Written: ${privateKeyPath}`)

  console.log('Identity files generated successfully')
}

generateIdentity().catch(err => {
  console.error('Error generating identity:', err)
  process.exit(1)
})
