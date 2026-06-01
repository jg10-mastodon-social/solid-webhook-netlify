# solid-webhook-netlify

Minimal implementation showing Solid OIDC authentication works with Netlify Functions.

## Project Structure

```
.
├── netlify/
│   └── functions/
│       └── webhook.ts        # Main function - auth + config fetch
├── netlify.toml              # Function routing
├── package.json
├── scripts/
│   └── generate-identity.ts  # Generates static/.well-known/ from env vars
├── src/
│   ├── auth.ts               # DPoP token verification
│   ├── config.ts             # Config loading from env vars
│   ├── solidFetch.ts         # Authenticated fetch
│   └── types.ts              # Shared types
├── static/
│   └── .well-known/          # Identity files (generated)
├── tests/
│   ├── webhook.test.ts       # Unit tests (mocked)
│   ├── integration/
│   │   └── webhook.integration.test.ts  # netlify functions:serve integration tests
│   └── fixtures/
│       └── .well-known/      # Test identity files
├── .env.example              # Template - copy and fill in production values
├── .env.test                 # Test env vars (for integration tests)
├── tsconfig.json
└── vite.config.ts
```

## Setup

```bash
# Install dependencies
npm install

# Copy example env and fill in production values
cp .env.example .env
# Edit .env with your values

# Generate identity files (or this runs as part of `npm run build`)
npm run generate:identity
```

## Testing

```bash
# Unit tests (mocked, no server needed)
npm test

# Integration tests (requires netlify-cli installed)
npm run test:integration
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BASE_URL` | Yes | Server base URL |
| `WEBID` | No | Solid WebID (default: `${BASE_URL}/webid`) |
| `ISSUER` | No | OIDC issuer (default: `${BASE_URL}`) |
| `WHITELISTED_ISSUERS` | Yes | Comma-separated list of trusted issuers |
| `WEBHOOK_CONFIG_URL` | Yes | URL to load webhook configuration from |
| `HANDLER_BASE_URL` | Yes | Namespace prefix for handlers |
| `SEND_TO_URL` | No | Webhook callback URL (default: `${BASE_URL}/webhook`) |

## What it does

1. Receives POST `/webhook` requests
2. Verifies DPoP token using `@solid/access-token-verifier`
3. Checks issuer is in `WHITELISTED_ISSUERS`
4. If valid: fetches `WEBHOOK_CONFIG_URL` with authenticated fetch
5. Returns:
   - `401` if auth fails
   - `403` if issuer not whitelisted
   - `200` if successful
   - `500` if config fetch fails

## Testing with netlify functions:serve

For local development and testing, we use `netlify functions:serve` instead of `netlify dev` to avoid the Vite dev server conflict:

```bash
# Start the function server
npx netlify functions:serve --port 9999

# In another terminal, run integration tests
npm run test:integration
```

The integration tests automatically:
1. Load `.env.test` environment variables
2. Generate test identity files to `tests/fixtures/.well-known/`
3. Compile TypeScript
4. Start `netlify functions:serve` on port 9999
5. Run tests against `http://localhost:9999/.netlify/functions/webhook`
6. Clean up the server after tests