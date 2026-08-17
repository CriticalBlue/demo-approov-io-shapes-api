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

## Detailed request logs for Dozzle

The server writes one structured JSON record for each request. Dozzle reads these records from the container's standard output. Successful requests use level `info`, rejected requests use `warn`, and server failures use `error`.

Example record:

```json
{"timestamp":"2026-08-17T12:00:00.000Z","level":"info","service":"shapes-api","event":"api_request","request_id":"6e91b433-a320-444d-99fb-31a61410ed39","method":"GET","endpoint":"shapes","api_version":"v3","status_code":200,"outcome":"success","duration_ms":4.27,"client_ip":"203.0.113.42","auth":{"approov_token":"valid","api_key":"valid"},"auth_checks":[{"control":"approov_token","result":"valid","reason":"valid approov token","enforced":true},{"control":"api_key","result":"valid","reason":"valid api key","enforced":true}],"request":{"method":"GET","original_url":"/v3/shapes","client_ip":"203.0.113.42","headers":{"approov-token":"[captured in approov.token]","api-key":"[redacted]"}},"approov":{"token":"full.jwt.value","claims":{"iss":"example.approov.io","sub":"approov|device|com.example.app"}},"response":{"status_code":200,"body":{"shape":"circle","status":"circle (approoved and api key valid)"}}}
```

Use these fields for basic metrics:

- `api_version` gives request counts for `v1`, `v3`, and `v5`.
- `approov_account` identifies the Approov account from the validated `iss` claim.
- `app_id` identifies the app package from the validated `sub` claim.
- `quickstart` identifies the client integration from `X-Approov-Quickstart`.
- `device_id_hash` gives a pseudonymous installation count.
- `client_ip_hash` gives a pseudonymous source count.
- `country` gives a location when a trusted proxy supplies it.
- `status_code`, `outcome`, `auth`, and `auth_checks` show each access-control decision.
- `rejection` records the stage, exact reason, and captured error for rejected requests.
- `request` records the URL, query, protocol, host, IP chain, headers, and body.
- `approov` records the complete Approov token and decoded claims when configured.
- `response` records the final status, headers, and response body.
- `duration_ms` provides API latency.

The `quickstart` field is client-supplied metadata. Do not use it as an authenticated identity.

Detailed logging is enabled by default for this demo API. It includes raw client IP addresses, user agents, the complete Approov token, decoded token claims, request headers, and response bodies. API keys, `Authorization`, cookies, proxy authorization, and response cookies remain redacted. Restrict Dozzle access and configure an appropriate log-retention period.

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

Example Dozzle filter:

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

Each delivery produces a correlated structured log record. Filter on `event:"analytics_delivery"`, `event:"analytics_delivery_skipped"`, or `event:"analytics_delivery_failed"`. Failure records include the error name, message, stack, HTTP status, and the provider response body when one exists, but never the GA API secret.

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
| `LOG_CLIENT_IP` | `true` | Include client, proxy-chain, and socket IP addresses. |
| `LOG_USER_AGENT` | `true` | Include raw user-agent values. |
| `LOG_APPROOV_TOKEN` | `true` | Include the complete Approov token and decoded claims. |
| `LOG_REQUEST_HEADERS` | `true` | Include request headers, with API keys and unrelated credentials redacted. |
| `LOG_REQUEST_BODY` | `true` | Include parsed or raw request bodies when available. |
| `LOG_RESPONSE_BODY` | `true` | Include the final response body. |
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
