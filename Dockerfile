ARG TAG=18-slim
FROM node:${TAG}

# Branch to check out for the build
ARG BUILD_RELEASE_FROM=main

# Ensures the commands we are about to run are executed by the root user.
USER root

# Always update the base image in order to get the last security fixes
RUN \
  apt update && \
  apt -y upgrade && \
  apt -y install git && \
  npm install pm2 -g

ENV USER="node"
ENV HOME="/home/${USER}"
ENV APP_DIR="${HOME}/app"

# We should never run containers as root, just like we do not run as root in our PCs and production servers.
# Everything from this line onwards will run in the context of the unprivileged user.
USER "${USER}"

# We need to explicitly create the app dir to have user `node` ownership, otherwise it will have `root` ownership.
RUN mkdir -p "${APP_DIR}"

# Setup working directory inside the container
WORKDIR "${APP_DIR}"

# Clone the repo and check out the selected branch
RUN \
  git clone https://github.com/criticalblue/demo-approov-io-shapes-api.git . && \
  git checkout "${BUILD_RELEASE_FROM}" && \
  ls -al

RUN npm install

# Start the app
CMD [ "pm2-runtime", "server/index.js" ]
