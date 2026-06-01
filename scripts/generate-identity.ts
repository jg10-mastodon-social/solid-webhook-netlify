import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const staticDir = path.join(rootDir, 'static', '.well-known')
const testFixturesDir = path.join(rootDir, 'tests', 'fixtures', '.well-known')

const isTest = process.env.GENERATE_TEST_IDENTITY === 'true'

const baseUrl = process.env.BASE_URL
if (!baseUrl) {
  console.error('BASE_URL is required')
  process.exit(1)
}

const webId = process.env.WEBID || `${baseUrl}/webid`
const issuer = process.env.ISSUER || baseUrl

const outputDir = isTest ? testFixturesDir : staticDir

const openidConfiguration = {
  issuer: issuer,
  authorization_endpoint: `${baseUrl}/authorize`,
  token_endpoint: `${baseUrl}/token`,
  jwks_uri: `${baseUrl}/.well-known/jwks.json`,
  solid_oidc_supported: true,
  solid_oidc_version: '1.0.0'
}

const webidTurtle = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
@prefix oidc: <http://www.w3.org/ns/solid/oidc#>.

<${webId}> a <http://www.w3.org/2005/Incubator/w3c/Alice/WebID/1.0#Agent>.
<${webId}> solid:oidcIssuer <${issuer}>.
`

console.log(`Generating identity files to ${outputDir}`)
console.log(`BASE_URL: ${baseUrl}`)
console.log(`WEBID: ${webId}`)
console.log(`ISSUER: ${issuer}`)

fs.mkdirSync(outputDir, { recursive: true })

const openidPath = path.join(outputDir, 'openid-configuration')
fs.writeFileSync(openidPath, JSON.stringify(openidConfiguration, null, 2))
console.log(`Written: ${openidPath}`)

const webidPath = path.join(outputDir, 'webid')
fs.writeFileSync(webidPath, webidTurtle)
console.log(`Written: ${webidPath}`)

console.log('Identity files generated successfully')