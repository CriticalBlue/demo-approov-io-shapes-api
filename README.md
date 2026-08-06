# Approov Shapes Server - Node-Koa

Approov shapes server using node.js with Koa and running in a docker container behind Traefik on the Approov demo
server at `shapes.approov.io` and `shapes.demo.approov.io`.

## Production Deployment

This guide assumes that you are logged in to the EC2 server that you set up by following the instructions for [AWS EC2 Traefik Setup for demo.approov.io](https://github.com/criticalblue/demo-approov-io-traefik). If you followed these instructions, the docker network `traefik`, which is required, will already exist. It can be re-created using this command: `sudo docker network create traefik`.

Git clone this repo into the home folder `/home/ec2-user` and change to the newly created directory:

```console
git clone https://github.com/criticalblue/demo-approov-io-shapes-api.git && cd demo-approov-io-shapes-api
```

Copy `.env.example` to `.env` and customize it. The only configuration required is the Approov token signing secret for the demo account.

Get the Approov secret using the Approov CLI:
```bash
approov secret -get base64
```

Add the Approov secret to the `.env` file, replacing `your_secret_here`.
```bash
APPROOV_SECRET=your_secret_here
```

Start the shapes server:
```bash
sudo docker-compose up --detach node
```

Inspect the logs (optional):
```bash
sudo docker-compose logs --follow --tail 10
```

Finally, check the server is running by visiting [https://shapes.demo.approov.io](https://shapes.demo.approov.io) and [https://shapes.approov.io](https://shapes.approov.io). You should see a web page with a short message directing you to the main Approov web site.
Also check [https://shapes.approov.io/v1/hello](https://shapes.approov.io/v1/hello) (you should see `{"text":"Hello, World!","status":"Hello, World!"}`) and [https://shapes.approov.io/v2/shapes](https://shapes.approov.io/v2/shapes) (you should see `{"status":"missing approov token"}`).

## Local Development

The `docker-compose.yml` file declares the service `dev` that you can use for localhost development, without the need to rebuild the docker image each time changes are made to the code.

### Setup
Copy `.env.example` to `.env` and customize it. Configure `.env` as shown below and replace `your.domain.com` with the domain used by your server or `localhost` if you are running the shapes API server on your own machine:

```bash
# The domain(s) served
PUBLIC_DOMAIN=your.domain.com

# Enable logging of API calls
ENABLE_LOGGING=true

# Dummy API Key for the v3 endpoint was generated with:
# $ strings /dev/urandom | grep -o '[[:alpha:]]' | head -n 25 | tr -d '\n'; echo
API_KEY=yXClypapWNHIifHUWmBIyPFAm

# Feel free to play with different secrets. For development you can create them with:
# $ openssl rand -base64 64 | tr -d '\n'; echo
APPROOV_SECRET=h+CX0tOzdAAR9l15bWAqvq7w9olk66daIH+Xk+IAHhVVHszjDzeGobzNnqyRze3lw/WVyWrc2gZfh3XXfBOmww==
```

Build the docker container:
```bash
docker-compose build dev
```

**Troubleshooting:**
1. To fix `open /Users/YOUR-USER-NAME/.docker/buildx/current: permission denied` on Mac, execute `sudo chown -R $(whoami) ~/.docker`
2. To fix `ERROR [dev internal] load metadata for docker.io/library/node:18-slim`, execute `docker pull node:18-slim`.

Run the shapes server:
```bash
docker-compose up --detach dev
```

Now, whenever your code is saved, the shapes server is restarted and you can issue new requests against it to test your changes.

The only time you need to rebuild the docker container is when you make changes to the `.env` file. To rebuild the shapes server:
```bash
docker-compose down && docker-compose up --detach dev
```

Assuming the shapes server is running on localhost you can use a web browser to visit [http://localhost:8002](http://localhost:8002) (you should see a web page with a short message directing you to the main Approov web site) and [http://localhost:8002/v1/hello](http://localhost:8002/v1/hello) (you should see `{"text":"Hello, World!","status":"Hello, World!"}`).

Inspect the logs (optional):
```bash
docker-compose logs --follow dev
```

Stop the shapes server:
```bash
docker-compose down
```

## Testing the Approov Shapes Server with Curl on Localhost

### Unprotected Endpoints

```shell
curl -X GET 'http://localhost:8002/hello'
```

Expected response: `Hello, World!`

```shell
curl -X GET 'http://localhost:8002/shapes'
```

Expected response: `Rectangle` (or another valid shape).

### /v1 - API-Key Protected

This test requires the API-Key in the header to match the API_KEY entry in the `.env` file (except for the hello endpoint which is always unprotected).

```shell
curl -X GET 'http://localhost:8002/v1/hello'
```

Expected response: `{"text":"Hello, World!","status":"Hello, World!"}`

```shell
curl -H "API-Key: yXClypapWNHIifHUWmBIyPFAm" -X GET 'http://localhost:8002/v1/shapes'
```

Expected response: `{"shape":"Rectangle","status":"Rectangle (api key protected)"}` (or another valid shape).

```shell
curl -H "API-Key: yXClypapWNHIifHUWmBIyPFAm" -X GET 'http://localhost:8002/v1/forms'
```

Expected response: `{"form":"Box","status":"Box (api key protected)"}` (or another valid solid).

### /v2 - Approov Token Protected

This test requires the APPROOV_SECRET entry in the `.env` file to match the Approov secret of the demo account (except for the hello endpoint which is always unprotected). The demo Approov secret can be retrieved using the Approov CLI: `` eval `approov role admin demo` ``, followed by `approov secret -get base64`. Check that the command `approov token -genExample shapes.approov.io` returns an example token as expected before issuing any `curl` command that uses it.

```shell
curl -X GET 'http://localhost:8002/v2/hello'
```

Expected response: `{"text":"Hello, World!","status":"Hello, World! (healthy)"}`

```shell
curl -H "Approov-Token: $(approov token -genExample shapes.approov.io)" -X GET 'http://localhost:8002/v2/shapes'
```

Expected response: `{"shape":"Rectangle","status":"Rectangle (approoved)"}` (or another valid shape).

```shell
curl -H "Authorization: bearer TEST" -H "Approov-Token: $(approov token -genExample shapes.approov.io -setDataHashInToken TEST)" -X GET 'http://localhost:8002/v2/forms'
```

Expected response: `{"form":"Box","status":"Box (approoved)"}` (or another valid solid).

### /v3 - API Key and Approov Token Protected with Token Binding

This test requires the APPROOV_SECRET entry in the `.env` file to match the Approov secret of the demo account (except for the hello endpoint which is always unprotected). The demo Approov secret can be retrieved using the Approov CLI: `` eval `approov role admin demo` ``, followed by `approov secret -get base64`. Check that the command `approov token -genExample shapes.approov.io` returns an example token as expected before issuing any `curl` command that uses it. Note that the `forms` endpoint requires the bound token to be prefixed with `bearer` in the `Authorization` header.

```shell
curl -X GET 'http://localhost:8002/v3/hello'
```

Expected response: `{"text":"Hello, World!","status":"Hello, World! (healthy)"}`

```shell
curl -H "API-Key: yXClypapWNHIifHUWmBIyPFAm" -H "Authorization: TEST" -H "Approov-Token: $(approov token -genExample shapes.approov.io -setDataHashInToken TEST)" -X GET 'http://localhost:8002/v3/shapes'
```

Expected response: `{"shape":"Rectangle","status":"Rectangle (approoved and api key valid)"}` (or another valid shape).

```shell
curl -H "API-Key: yXClypapWNHIifHUWmBIyPFAm" -H "Authorization: bearer TEST" -H "Approov-Token: $(approov token -genExample shapes.approov.io -setDataHashInToken TEST)" -X GET 'http://localhost:8002/v3/forms'
```

Expected response: `{"form":"Box","status":"Box (approoved and api key valid)"}` (or another valid solid).

### /v4 - API Key and Custom Approov Token Protected

```shell
curl -X GET 'http://localhost:8002/v4/hello'
```

Expected response: `{"text":"Hello, World!","status":"Hello, World! (healthy)"}`

The `shapes` and `forms` endpoints are not testable with `curl` and `approov` because the Approov CLI cannot generate an Approov token with custom claims.

### /v5 - API Key, Approov Token and HTTP Message Signature Protected

```shell
curl -X GET 'http://localhost:8002/v4/hello'
```

Expected response: `{"text":"Hello, World!","status":"Hello, World! (healthy)"}`

The `shapes` endpoint is not testable with `curl` and `approov` because `curl` has no support for HTTP message signing yet and
the Approov CLI cannot generate an Approov token with a custom `ipk` claim.

## Testing the Approov Shapes Server with the Postman Collection

### Configuring the Environment

In order to use the Postman collection it is necessary to start the shapes server is started with this `.env` file, where `your.domain.com` is replaced by the domain used by your server or `localhost` if you are running the shapes API server on your own machine:

```bash
# The domain(s) served
PUBLIC_DOMAIN=your.domain.com

# Enable logging of API calls
ENABLE_LOGGING=true

# Dummy API Key for the v3 endpoint was generated with:
# $ strings /dev/urandom | grep -o '[[:alpha:]]' | head -n 25 | tr -d '\n'; echo
API_KEY=yXClypapWNHIifHUWmBIyPFAm

# Feel free to play with different secrets. For development you can create them with:
# $ openssl rand -base64 64 | tr -d '\n'; echo
APPROOV_SECRET=h+CX0tOzdAAR9l15bWAqvq7w9olk66daIH+Xk+IAHhVVHszjDzeGobzNnqyRze3lw/WVyWrc2gZfh3XXfBOmww==
```

### Testing with Postman

The shapes API can be tested on localhost, a staging or a production server with this [Postman collection](https://raw.githubusercontent.com/approov/postman-collections/master/quickstarts/shapes-api/shapes-api.postman_collection.json).

To use the Postman collection to test a production server, you need to manually update the `Approov-Token` header for each valid request example in the collection with an example token from the Approov CLI:

```bash
approov token -genExample shapes.approov.io
```
