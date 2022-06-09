#!/bin/sh

set -eu

Show_Help() {
  cat <<EOF

  A bash script to deploy, via ssh, the Shapes server in a docker container, that
  is then served by Traefik.


  SYNOPSIS:

  $ ./deploy [options]


  OPTIONS:

  --env           Sets the deployment enviroment (defaults to dev):
                  $ ./deploy --env dev
                  $ ./deploy --env staging
                  $ ./deploy --env prod

  --env-type     Sets the deployment enviroment type (defaults to remote):
                  $ ./deploy --env-type
                  $ ./deploy --env-type local
                  $ ./deploy --env-type remo

  --from          Sets the git branch/tag for the release (defaults to master):
                  $ ./deploy --from master
                  $ ./deploy --from 1.0.0

  --from-current  Sets the release to the current git branch/tag:
                  $ ./deploy --from-current


  COMMANDS:

  copy-env        Copies the remote .env to ./.local/deploy (defaults: --env dev):
                  $ ./deploy copy-env
                  $ ./deploy --env staging copy-env
                  $ ./deploy --env prod copy-env

  update-env      Updates the local env deploy file from the .env remote file (defaults: --env dev):
                  $ ./deploy update-env
                  $ ./deploy --env staging update-env
                  $ ./deploy --env prod update-env

  run             Deploys a release (defaults: --env dev, --env-type remote, --from master):
                  $ ./deploy --from-current run
                  $ ./deploy --env staging --from branch-name run
                  $ ./deploy --env staging --env-type remote --from branch-name run
                  $ ./deploy --env staging --env-type local --from branch-name run
                  $ ./deploy --env prod run

  logs            Tails the logs on the remote server:
                  $ ./deploy logs
                  $ ./deploy --env prod logs

  down            Shutdown the Shapes server for the given environment:
                  $ ./deploy down dev
                  $ ./deploy down staging

  up              Boots the Shapes server for the given environment:
                  $ ./deploy up dev
                  $ ./deploy up staging


EOF
}

Exit_With_Error() {
  echo "\n---> ERROR: ${1? Missing exit error message...}\n"
  exit 1
}

Setup_Configuration() {
  ENV_DEPLOY_FILE=./.env.${RELEASE_ENV}.deploy

  if [ -f "${ENV_DEPLOY_FILE}" ]; then
    . "${ENV_DEPLOY_FILE}"

    [ -z ${REMOTE_USER:-} ] && Exit_With_Error "REMOTE_USER - ${ENV_ERROR}"
  else
    Exit_With_Error "Missing the ${ENV_DEPLOY_FILE} file. Add it as per DEPLOYMENT.md instructions."
  fi

  REMOTE_HOME="/home/${REMOTE_USER}"

  case "${RELEASE_ENV}" in
    "dev" | "staging" )
      DOMAINS="${HOST_USER}.${RELEASE_ENV}.${BASE_PUBLIC_DOMAIN}"
      REMOTE_APP_DIR="${REMOTE_HOME}/${HOST_USER}/${DOMAINS}"
      DOCKER_IMAGE="${HOST_USER}/${DOMAINS}:${DATETIME}"
    ;;

    "prod" )
      local shapes_domain="shapes.approov.io"
      DOMAINS="${BASE_PUBLIC_DOMAIN},${shapes_domain}"
      REMOTE_APP_DIR="${REMOTE_HOME}/${shapes_domain}"
      DOCKER_IMAGE="${APP_VENDOR}/${shapes_domain}:${DATETIME}"
    ;;

    * )
      Exit_With_Error "Invalid value for --env flag. Please provide one of dev, staging or prod."
  esac
}

SSH_Remote_Execute() {
  ssh \
    -p "${REMOTE_PORT}" \
    "${REMOTE_USER}"@"${REMOTE_ADDRESS}" "${1? Missing command to execute via SSH on the remote server...}"
}

SCP_Copy_From_Remote() {
  local from_file="${1? Missing the file to copy from the remote server...}"
  local to_file="${2? Missing where to save the file from the remote server...}"

  scp \
    -P "${REMOTE_PORT}" \
    "${REMOTE_USER}"@"${REMOTE_ADDRESS}":"${REMOTE_APP_DIR}/${from_file}" "${to_file}"
}

Copy_From_Remote() {
  Setup_Configuration

  local from_file="${1? Missing the file to copy from the remote server...}"
  local to_file="./${LOCAL_DEPLOY_DIR}/${RELEASE_ENV}/${2:-${from_file}}"

  SCP_Copy_From_Remote "${from_file}" "${to_file}"

  printf "\nFind the remote ${REMOTE_APP_DIR}/${1} file at ${to_file}\n\n"
}

Update_Local_Env_Deploy_From_Remote_Env() {
  Setup_Configuration

  local backup_file="./${LOCAL_DEPLOY_DIR}/${RELEASE_ENV}/${ENV_DEPLOY_FILE}-update-${DATETIME}"

  cp "${ENV_DEPLOY_FILE}" "${backup_file}"
  printf "\nFind the backup file at ${backup_file}\n\n"

  SCP_Copy_From_Remote ".env" "${ENV_DEPLOY_FILE}"

  printf "\nUpdated the file ${ENV_DEPLOY_FILE}\n\n"
}

SCP_Copy_To_Remote() {
  local from_file="${1? Missing the file to copy with SCP to the remote server...}"
  local to_file="${2:-${from_file}}"

  scp \
    -P "${REMOTE_PORT}" \
    "${from_file}" \
    "${REMOTE_USER}"@"${REMOTE_ADDRESS}":"${REMOTE_APP_DIR}/${to_file}"
}

Docker_Build_Release() {
  sudo docker build \
    --file Dockerfile.prod \
    --build-arg "BUILD_RELEASE_FROM=${BUILD_RELEASE_FROM? Missing value for BUILD_RELEASE_FROM}" \
    --tag "${DOCKER_IMAGE}" \
    "${PWD}"
}

SSH_Remote_Docker_Load() {
  printf "\n---> Loading the docker image ${DOCKER_IMAGE} to ${REMOTE_USER}@${REMOTE_ADDRESS}:${REMOTE_PORT}\n"

  sudo docker \
    save "${DOCKER_IMAGE}" | gzip -6 | \
    ssh \
      -p "${REMOTE_PORT}" "${REMOTE_USER}"@"${REMOTE_ADDRESS}" \
      "gzip -d | sudo docker load"
}

Tail_Remote_Logs() {
  Setup_Configuration

  SSH_Remote_Execute "cd ${REMOTE_APP_DIR} && sudo docker-compose logs --follow node"
}

Boot_Remote_Server() {
  local shutdown_env="${1:-}"

  case "${shutdown_env}" in
    "dev" | "staging" )
      RELEASE_ENV=${shutdown_env}
      Setup_Configuration
      SSH_Remote_Execute "cd ${REMOTE_APP_DIR} && sudo docker-compose up --detach node"
    ;;

    "" )
      Exit_With_Error "Please provide the environment to use, e.g ./deploy up dev or ./deploy up staging"
    ;;

    * )
      Exit_With_Error "You can only boot the Shapes server for dev or staging environments."
  esac
}

Shutdown_Remote_Server() {
  local shutdown_env="${1:-}"

  case "${shutdown_env}" in
    "dev" | "staging" )
      RELEASE_ENV=${shutdown_env}
      Setup_Configuration
      SSH_Remote_Execute "cd ${REMOTE_APP_DIR} && sudo docker-compose down"
    ;;

    "" )
      Exit_With_Error "Please provide the environment to use, e.g ./deploy down dev or ./deploy down staging"
    ;;

    * )
      Exit_With_Error "You can only shutdown the Shapes server for dev or staging environments."
  esac
}

Deploy_Release() {
  Setup_Configuration

  Docker_Build_Release

  echo "\n\n------------------ DEPLOYING TO: ${REMOTE_APP_DIR} ------------------\n\n"

  SSH_Remote_Execute "mkdir -p ${REMOTE_APP_DIR}"

  local env_deploy_backup_file=".env.remote-backup-${DATETIME}"

  case "${ENV_FILE_TO_USE}" in
    "remote" )
      # Keep a local backup copy from the remote .env file just in case we
      # screw-up it with the deployment.
      Copy_From_Remote ".env" "${env_deploy_backup_file}"
    ;;

    "local" )
      # The .env.deploy file was sourced at Setup_Configuration, therefore we
      # need to ensure that some env vars are not missing when using it to
      # deploy the release.
      [ -z ${API_KEY:-} ] && Exit_With_Error "API_KEY - ${ENV_ERROR}"
      [ -z ${APPROOV_SECRET:-} ] && Exit_With_Error "APPROOV_SECRET - ${ENV_ERROR}"

      # The domains used for Traefik to serve the Shapes backend server need to
      # be added when using the local .env.deploy because they are dynamically
      # set at the Setup_Configuration().
      if grep -q "^PUBLIC_DOMAIN=" "${ENV_DEPLOY_FILE}"; then
        sed -i -e "s|^PUBLIC_DOMAIN=.*|PUBLIC_DOMAIN=${DOMAINS}|" "${ENV_DEPLOY_FILE}"
      else
        echo "PUBLIC_DOMAIN=${DOMAINS}" >> "${ENV_DEPLOY_FILE}"
      fi

      SCP_Copy_To_Remote "${ENV_DEPLOY_FILE}" ".env"
    ;;
  esac

  # No matter which env we use the docker image has a timestamp as the tag for
  # each release, therefore we always need to update the remote .env file
  SSH_Remote_Execute "sed -i -e 's|^DOCKER_IMAGE=.*|DOCKER_IMAGE=${DOCKER_IMAGE}|' ${REMOTE_APP_DIR}/.env"

  SCP_Copy_To_Remote ".env.default"

  SCP_Copy_To_Remote "docker-compose.yml"

  SSH_Remote_Docker_Load

  SSH_Remote_Execute "cd ${REMOTE_APP_DIR} && sudo docker-compose up --detach node"

  SSH_Remote_Execute "cd ${REMOTE_APP_DIR} && sudo docker-compose logs --tail 100"

  case "${ENV_FILE_TO_USE}" in
    "remote" )
      printf "\nFind the backup for the .env file at: ${env_deploy_backup_file}\n\n"
    ;;
  esac

  echo "\n\n---> Shapes server now available at: ${DOMAINS}\n\n"
}

Main() {

  local HOST_USER=$(id -un)
  local DATETIME=$(date +%s)

  local APP_VENDOR=approov

  local REMOTE_PORT=22
  local REMOTE_ADDRESS=demo.approov.io

  local RELEASE_ENV=dev
  local BASE_PUBLIC_DOMAIN=shapes.demo.approov.io
  local BUILD_RELEASE_FROM=master
  local LOCAL_DEPLOY_DIR=.local/deploy
  local ENV_FILE_TO_USE=remote

  local ENV_ERROR="Env var not set or empty. See DEPLOYMENT.md."

  # To be used to copy env files from the remote server and for backups when deploying
  mkdir -p "${LOCAL_DEPLOY_DIR}"/dev "${LOCAL_DEPLOY_DIR}"/staging "${LOCAL_DEPLOY_DIR}"/prod

  for input in "${@}"; do
    case "${input}" in
      --env )
        RELEASE_ENV="${2? Missing release env, e.g dev, staging, or prod}"
        shift 2
      ;;

      --env-type )
        ENV_FILE_TO_USE="${2? Missing env locatiotaion ot use, e.g local or remote}"
        shift 2
      ;;

      --from )
        BUILD_RELEASE_FROM="${2? Missing branch or tag to deploy from, e.g master or 1.0.0}"
        shift 2
      ;;

      --from-current )
        shift 1
        BUILD_RELEASE_FROM=$(git rev-parse --symbolic-full-name --abbrev-ref HEAD)
      ;;

      -h | --help )
        Show_Help
        exit $?
      ;;

      copy-env )
        shift 1
        Copy_From_Remote ".env"
        exit $?
      ;;

      update-env )
        Update_Local_Env_Deploy_From_Remote_Env
        exit $?
      ;;

      run )
        Deploy_Release
        exit $?
      ;;

      logs )
        Tail_Remote_Logs
        exit $?
      ;;

      down )
        shift 1
        Shutdown_Remote_Server "${@}"
        exit $?
      ;;

      up )
        shift 1
        Boot_Remote_Server "${@}"
        exit $?
      ;;
    esac
  done

  Show_Help
}

Main "${@}"