# Approov Shapes Server - Node-Koa

Approov shapes server using node.js with Koa and running in a docker container behind Traefik on the Approov demo
server at `shapes.approov.io` and `shapes.demo.approov.io`.

## Production Deployment

This guide assumes that you are logged in to the EC2 server that you set up by following the instructions for [AWS EC2 Traefik Setup for demo.approov.io](https://github.com/criticalblue/demo-approov-io-traefik). If you followed these instructions, the docker network `traefik`, which is required, will already exist. It can be re-created using this command: `sudo docker network create traefik`.

Git clone this repo into the home folder `/home/ec2-user` and change to the newly created directory:

```console
git clone https://github.com/CriticalBlue/demo-approov-io-shapes-api.git && cd demo-approov-io-shapes-api
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
