# solid-webhook-netlify

![No maintenance intended](https://img.shields.io/badge/no_maintenance_intended-orange) ![Code quality: TDD vibe coded](https://img.shields.io/badge/code_quality-TDD_vibe_coded-orange)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/jg10-mastodon-social/solid-webhook-netlify#WHITELISTED_ISSUERS=&WEBHOOK_CONFIG_URL=&HANDLER_BASE_URL=https://example.com/handlers%23)

Solid pod webhook listener using Netlify Functions. Verifies incoming webhook DPoP tokens and performs authenticated fetches to a Solid pod.

## Prerequisites

- Node.js 18+
- [netlify-cli](https://docs.netlify.com/cli/get-started/) for local development (`npm install -g netlify-cli`)

## Setup

```bash
npm install

netlify build --context=dev
```

### Granting the service access to your pod

This service authenticates to your Solid pod using its own WebID. After
deployment, that WebID is served at `${BASE_URL}/webid` (or whatever you
set via the `WEBID` env var). It is the identity that appears in
authenticated fetches to your pod.

The webhook config at `WEBHOOK_CONFIG_URL` declares one or more
*handlers* (RDF resources in the `HANDLER_BASE_URL` namespace) that
react to events on your pod. You need to grant the service's WebID
**two separate kinds of access**, both via your pod's Sharing/Access
control UI:

1. **Read access on the webhook config file** (`WEBHOOK_CONFIG_URL`).
   The service reads this file on every webhook delivery to load the
   handler definitions.

2. **Whatever access each handler needs on the resources accessed by each handler.** Handlers are user-defined and may read, write, append, or
   delete data on your pod on your behalf. For each handler, grant the
   service's WebID the minimum permissions it requires (`Read`,
   `Write`, `Append`, and/or `Delete`) on the relevant resources or
   their containing containers. Most non-trivial handlers will need
   `Write` or `Append`.

A `403` in the function logs against `WEBHOOK_CONFIG_URL` means the
config ACL is missing; a `403` from a downstream request made by a
handler means the handler's target resource is not authorized. See the
[WAC spec](https://solid.github.io/web-access-control-spec/) for the
underlying protocol and manual `.acl` authoring.

Build time generates:
- `src/base-url.ts` - site URL (gitignored)
- `src/private-key.ts` - private key for signing (gitignored)
- `public/webid`, `public/jwks.json`, `public/.well-known/openid-configuration` - public identity files

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
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
│   ├── types.ts          # Shared types
│   ├── base-url.ts       # Generated at build time (gitignored)
│   └── private-key.ts    # Generated at build time (gitignored)
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

## Architecture

- **DPoP authentication**: Tokens verified using `@solid/access-token-verifier`. Server identity keys generated at build time.
- **Private key**: Stored in `src/private-key.ts` (bundled into Lambda function, not publicly accessible).
- **Public identity**: Stored in `public/` (jwks.json, webid, openid-configuration) for client verification.
- **Webhook configuration**: RDF file loaded from `WEBHOOK_CONFIG_URL`, parsed using `n3`.
- **Identity endpoints**: Server provides OIDC identity via static files in `public/` (`.well-known/openid-configuration`, `webid`, `jwks.json`).
