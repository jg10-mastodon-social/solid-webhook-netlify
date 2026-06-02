import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateKeyPair, exportJWK, importJWK } from 'jose'
import { createHash } from 'node:crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const publicDir = path.join(rootDir, 'public')
const envPath = path.join(rootDir, '.env')

const baseUrl = process.env.BASE_URL
if (!baseUrl) {
  console.error('BASE_URL is required')
  process.exit(1)
}

const webId = process.env.WEBID || `${baseUrl}/webid`
const issuer = process.env.ISSUER || baseUrl

function derivePublicJwk(privateJwk: Record<string, unknown>): Record<string, unknown> {
  const { d, dp, dq, p, q, ...publicFields } = privateJwk
  return {
    ...publicFields,
    use: 'sig',
    alg: 'ES256',
    kid: createHash('sha256')
      .update(JSON.stringify(publicFields))
      .digest('base64url'),
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
    const importedKey = await importJWK(parsed, 'ES256')
    const fullJwk = await exportJWK(importedKey)
    publicJwk = derivePublicJwk(fullJwk as Record<string, unknown>)
    privateJwk = fullJwk as Record<string, unknown>
  } else {
    console.log('Generating new key pair')
    const { publicKey, privateKey } = await generateKeyPair('ES256', { crv: 'P-256' })

    publicJwk = await exportJWK(publicKey)
    publicJwk.kid = publicJwk.kid || Buffer.from(JSON.stringify(publicJwk)).toString('base64url').slice(0, 16)
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

  if (!existingJwks) {
    let envContent = ''
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8')
      const lines = envContent.split('\n').filter(line => !line.startsWith('JWKS='))
      envContent = lines.join('\n') + '\n'
    }

    const jwksEnvVar = `JWKS=${JSON.stringify(privateJwk)}`
    fs.writeFileSync(envPath, envContent + jwksEnvVar + '\n')
    console.log(`Written: ${envPath} (JWKS env var)`)
  }

  console.log('Identity files generated successfully')
}

generateIdentity().catch(err => {
  console.error('Error generating identity:', err)
  process.exit(1)
})