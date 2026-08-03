ARG TAG=24-slim
FROM node:${TAG}

ENV USER="node"
ENV HOME="/home/${USER}"
ENV APP_DIR="${HOME}/app"
ENV NODE_ENV="production"

RUN mkdir -p "${APP_DIR}" && chown "${USER}:${USER}" "${APP_DIR}"

WORKDIR "${APP_DIR}"
USER "${USER}"

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node server ./server

CMD [ "node", "server/index.js" ]
