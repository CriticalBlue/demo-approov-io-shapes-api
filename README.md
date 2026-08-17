# Approov Shapes API

This server supports the Approov mobile quickstarts. It exposes four `GET` endpoints and no other application endpoints.

| Endpoint | Access control | Purpose |
|---|---|---|
| `GET /hello` | Public | Confirm the connection. |
| `GET /v1/shapes` | API key | Return a random shape. |
| `GET /v3/shapes` | API key and Approov token | Return a random shape. |
| `GET /v5/shapes` | API key, Approov token, and conditional message signature | Return a random shape. |

All other paths return `404`. The [OpenAPI file](docs/shapes-openapi.yaml) defines the public interface.

## Run the server

1. Install the locked dependencies.

   ```sh
   npm ci
   ```

2. Copy the example environment file.

   ```sh
   cp .env.example .env
   ```

3. Add the required secrets to `.env`.

4. Start the server.

   ```sh
   npm start
   ```

5. Validate the connection.

   ```sh
   curl http://localhost:8002/hello
   ```

The expected response is `Hello, World!`.

## Access control

Set `API_KEY` for the `v1`, `v3`, and `v5` endpoints. Send this value in the `Api-Key` header.

Set `APPROOV_SECRET` to the base64 Approov token secret. The server validates Approov tokens with the `HS256` algorithm.

Set `ENFORCE_APPROOV=false` only for a controlled warning-mode test. In this mode, the server accepts an invalid or missing Approov token.

The `v5` endpoint reads the optional `ipk` claim from a valid Approov token. If the claim exists, the server requires a valid HTTP message signature.

## Usage logs for Dozzer

The server writes one JSON record for each request. Dozzer can ingest these records from standard output.

Example record:

```json
{"timestamp":"2026-08-17T12:00:00.000Z","level":"info","service":"shapes-api","event":"api_request","request_id":"6e91b433-a320-444d-99fb-31a61410ed39","method":"GET","endpoint":"shapes","api_version":"v3","supported_endpoint":true,"status_code":200,"outcome":"success","duration_ms":4.27,"quickstart":"ios-urlsession","approov_account":"example.approov.io","app_id":"com.example.app","device_id_hash":"991f74ac2f01bd6c39e153bfd8068770","client_ip_hash":"ee16f6db33fe6d716250396a28072965","country":"GB","auth":{"api_key":"valid","approov_token":"valid"}}
```

Use these fields for basic metrics:

- `api_version` gives request counts for `v1`, `v3`, and `v5`.
- `approov_account` identifies the Approov account from the validated `iss` claim.
- `app_id` identifies the app package from the validated `sub` claim.
- `quickstart` identifies the client integration from `X-Approov-Quickstart`.
- `device_id_hash` gives a pseudonymous installation count.
- `client_ip_hash` gives a pseudonymous source count.
- `country` gives a location when a trusted proxy supplies it.
- `status_code`, `outcome`, and `auth` show success and rejection rates.
- `duration_ms` provides API latency.

The `quickstart` field is client-supplied metadata. Do not use it as an authenticated identity.

The server never logs API keys, Approov tokens, authorization headers, public keys, or signatures. Raw client IP addresses and user agents are disabled by default.

Set `TRACKING_HASH_SALT` to a random secret with at least 16 characters. Without this value, the server omits both pseudonymous hash fields.

Enable the Approov issuer claim to identify an account:

```sh
approov policy -setIssuer on
```

Enable the Approov subject claim to identify an app package:

```sh
approov policy -setSubject on
```

Both commands change an Approov account policy and require an administrator role.

Set `TRUST_PROXY=true` only behind a trusted reverse proxy. This repository sets it for the Traefik production service.

Set `CLIENT_COUNTRY_HEADER` only when the trusted proxy controls that header. For Cloudflare, the value is usually `CF-IPCountry`.

Example Dozzer filter:

```text
service:"shapes-api" AND event:"api_request" AND supported_endpoint:true
```

## Optional Google Analytics export

The API can send supported requests to Google Analytics 4 through the Measurement Protocol. This export is disabled by default.

Set these environment variables:

```dotenv
ENABLE_GOOGLE_ANALYTICS=true
GA_MEASUREMENT_ID=G-XXXXXXXXXX
GA_API_SECRET=replace_with_a_secret
TRACKING_HASH_SALT=replace_with_a_random_secret
```

The exporter uses the European collection host by default. Set `GA_HOST=www.google-analytics.com` to use the global host.

The exporter sends the `quickstart_api_request` custom event. It sends advertising consent as denied and never delays an API response.

Google describes the Measurement Protocol as an addition to normal web or Firebase collection. A server-only integration provides partial reporting.

HubSpot is not part of the runtime integration. Its current custom-event API requires a predefined event and a CRM record identifier.

## Environment variables

| Variable | Default | Description |
|---|---:|---|
| `HTTP_PORT` | `8002` | HTTP port. |
| `HTTPS_PORT` | `8003` | Direct HTTPS port. |
| `ENFORCE_HTTPS` | `false` | Redirect HTTP requests to HTTPS. |
| `HTTPS_MODE` | `direct` | Use `direct` or `x-forwarded-proto`. |
| `API_KEY` | Demo value | API key for protected endpoints. |
| `APPROOV_SECRET` | Demo value | Base64 secret for Approov token validation. |
| `ENFORCE_APPROOV` | `true` | Reject invalid Approov tokens. |
| `ALLOW_DEBUG_TOKENS` | `false` | Accept JSON claim objects for local tests. |
| `ENABLE_LOGGING` | `true` | Write structured request logs. |
| `ENABLE_DEBUG_LOGGING` | `false` | Write extra debug logs. |
| `TRUST_PROXY` | `false` | Trust proxy forwarding headers. |
| `TRACKING_HASH_SALT` | Empty | Secret for pseudonymous identifiers. |
| `LOG_CLIENT_IP` | `false` | Include raw client IP addresses. |
| `LOG_USER_AGENT` | `false` | Include raw user-agent values. |
| `CLIENT_COUNTRY_HEADER` | Empty | Trusted proxy country header. |
| `ENABLE_GOOGLE_ANALYTICS` | `false` | Send GA4 events. |
| `GA_MEASUREMENT_ID` | Empty | GA4 stream measurement ID. |
| `GA_API_SECRET` | Empty | GA4 Measurement Protocol secret. |
| `GA_HOST` | `region1.google-analytics.com` | GA4 collection host. |

## Tests

Run the complete test suite:

```sh
npm test
```

The suite validates the four-endpoint boundary, access control, HTTPS redirects, structured tracking, and `v5` message signatures.

## Docker Compose

The `dev` service publishes the API on localhost. The `node` service connects to the external `traefik` network.

Create `.env` before you run Docker Compose. Do not commit secrets from this file.

```sh
docker compose up --build dev
```

## References

- [Approov token claims and policy configuration](https://approov.io/docs/latest/approov-usage-documentation/)
- [Google Analytics Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- [HubSpot custom event occurrences](https://developers.hubspot.com/docs/api-reference/latest/events/send-event-data/guide)
