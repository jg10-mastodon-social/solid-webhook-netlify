# solid-webhook-netlify

![No maintenance intended](https://img.shields.io/badge/no_maintenance_intended-orange) ![Code quality: TDD vibe coded](https://img.shields.io/badge/code_quality-TDD_vibe_coded-orange)

Solid pod webhook listener using Netlify Functions. Verifies incoming webhook DPoP tokens and performs authenticated fetches to a Solid pod.

## Prerequisites

- Node.js 18+
- [netlify-cli](https://docs.netlify.com/cli/get-started/) for local development (`npm install -g netlify-cli`)

## Setup

```bash
npm install

netlify build --context=dev 
```

Generates identity files in public/
Uses private key in JWKS env variable if defined, or writes a new one to .env

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BASE_URL` | Yes | Your Netlify site URL |
| `WHITELISTED_ISSUERS` | Yes | Comma-separated list of trusted OIDC issuers |
| `WEBHOOK_CONFIG_URL` | Yes | URL to your webhook RDF configuration |
| `HANDLER_BASE_URL` | Yes | Namespace prefix for handlers |
| `WEBID` | No | Solid WebID (default: `${BASE_URL}/webid`) |
| `ISSUER` | No | OIDC issuer (default: `${BASE_URL}`) |
| `SEND_TO_URL` | No | Webhook callback URL (default: `${BASE_URL}/webhook`) |

## How it works

1. Receives POST requests at `/webhook`
2. Verifies DPoP token using `@solid/access-token-verifier`
3. Checks issuer is in `WHITELISTED_ISSUERS`
4. If valid: fetches `WEBHOOK_CONFIG_URL` with authenticated fetch
5. Returns success or appropriate error code

## Testing

```bash
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests with mocked Netlify context
npm run test:e2e	   # Runs against netlify dev server
```


```
.
├── netlify/
│   └── functions/
│       └── webhook.ts     # Entry point
├── netlify.toml          # Build config + function routing
├── public/               # Generated identity files (auto-generated at build)
│   ├── webid
│   ├── jwks.json
│   └── .well-known/
│       └── openid-configuration
├── scripts/
│   └── generate-identity.ts  # Generates identity files from env vars
├── src/
│   ├── auth.ts           # DPoP token verification
│   ├── config.ts         # Config loading
│   ├── solidFetch.ts     # Authenticated fetch
│   └── types.ts          # Shared types
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

## Architecture

- **DPoP authentication**: Tokens verified using `@solid/access-token-verifier`. Server identity keys generated at build time from `BASE_URL`, stored in `public/`.
- **Webhook configuration**: RDF file loaded from `WEBHOOK_CONFIG_URL`, parsed using `n3`.
- **Identity endpoints**: Server provides OIDC identity via static files in `public/` (`.well-known/openid-configuration`, `webid`, `jwks.json`).
