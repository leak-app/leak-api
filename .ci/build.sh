#!/bin/bash

set -euo pipefail

# Please create a .github_token file in the home directory with the following content:
GITHUB_USERNAME=${GITHUB_USERNAME:-tiendat77}
GITHUB_PASSWORD=${GITHUB_PASSWORD:-$(cat ~/.github_token)}

# Default variables
APP_VERSION=$(
  cat package.json \
    | grep version \
    | head -1 \
    | awk -F: '{ print $2 }' \
    | sed 's/[",]//g' \
    | tr -d '[[:space:]]'
)

DOCKER_REGISTRY="ghcr.io"
REPOSITORY_OWNER="leak-app"
DOCKER_IMAGE_TAG="latest"
BUILD_MODE="development"

# Images to build and push, as "<image name>:<Dockerfile target>"
IMAGES=(
  "leak-api:runner"
  "leak-api-migrator:migrator"
)

image_name() { echo "${DOCKER_REGISTRY}/${REPOSITORY_OWNER}/${1%%:*}"; }
image_target() { echo "${1##*:}"; }

# Functions
docker_login() {
  echo ''
  echo ''
  echo '     ooo,    .---.'
  echo '    o`  o   /    |\________________'
  echo '   o`   `oooo()  | ________   _   _)'
  echo '   `oo   o` \    |/        | | | |'
  echo '     `ooo`   `---`         "-" |_|'
  echo ''
  echo "🗝️  Logging in to GitHub Container Registry"

  if [[ -z "${GITHUB_USERNAME:-}" || -z "${GITHUB_PASSWORD:-}" ]]; then
    echo "❌ Error: GITHUB_USERNAME and/or GITHUB_PASSWORD are not set."
    echo "   Please define them in your environment or create a credentials file:"
    echo "   - \$HOME/.github_token"
    echo "   - .ci/.github_token"
    exit 1
  fi

  echo "$GITHUB_PASSWORD" | docker login "$DOCKER_REGISTRY" -u "$GITHUB_USERNAME" --password-stdin || {
    echo "❌ Login failed!"
    exit 1
  }
}

build_images() {
  echo ''
  echo ''
  echo ''
  echo '                 ##         .'
  echo '           ## ## ##        =='
  echo '        ## ## ## ## ##    ==='
  echo '    /"""""""""""""""""\___/ ==='
  echo '   {                       /  ===-'
  echo '    \______ O           __/'
  echo '      \    \         __/'
  echo '       \____\_______/'
  echo ''

  local entry name target
  for entry in "${IMAGES[@]}"; do
    name=$(image_name "$entry")
    target=$(image_target "$entry")

    echo "🐳  Building ${name} (target: ${target}) with tags: ${DOCKER_IMAGE_TAG} & ${APP_VERSION}"

    docker build \
      -t "${name}:${DOCKER_IMAGE_TAG}" \
      -t "${name}:${APP_VERSION}" \
      --build-arg BUILD_MODE=${BUILD_MODE} \
      --platform 'linux/arm64' \
      --target "${target}" \
      -f Dockerfile . || {
        echo "❌ Build failed for ${name}!"
        exit 1
      }
  done
}

push_images() {
  echo ''
  echo ''
  echo ''
  echo '          !'
  echo '          ^'
  echo '         / \'
  echo '        /___\'
  echo '       |=   =|'
  echo '       |     |'
  echo '       |     |'
  echo '       |     |'
  echo '       |     |'
  echo '       |     |'
  echo '       |     |'
  echo '      /|##!##|\'
  echo '     / |##!##| \'
  echo '    /  |##!##|  \'
  echo '   |  / ^ | ^ \  |'
  echo '   | /  ( | )  \ |'
  echo '   |/   ( | )   \|'
  echo '       ((   ))'
  echo '      ((  :  ))'
  echo '       ((   ))'
  echo '        (( ))'
  echo '         ( )'
  echo ''

  local entry name
  for entry in "${IMAGES[@]}"; do
    name=$(image_name "$entry")

    echo "🚀  Pushing ${name} to GitHub Container Registry"

    docker push "${name}:${DOCKER_IMAGE_TAG}" || {
      echo "❌ Push failed for ${name}:${DOCKER_IMAGE_TAG}!"
      exit 1
    }

    docker push "${name}:${APP_VERSION}" || {
      echo "❌ Push failed for ${name}:${APP_VERSION}!"
      exit 1
    }
  done
}

clean_up() {
  echo "🪠  Clean up docker build shit "

  local entry name
  for entry in "${IMAGES[@]}"; do
    name=$(image_name "$entry")

    docker rmi "${name}:${DOCKER_IMAGE_TAG}" || echo "⚠️ Could not remove ${name}:${DOCKER_IMAGE_TAG} image"

    docker rmi "${name}:${APP_VERSION}" || echo "⚠️ Could not remove ${name}:${APP_VERSION} image"
  done
}

# Main function to orchestrate the process
main() {
  local git_branch=$(git rev-parse --abbrev-ref HEAD)
  case "$git_branch" in
    "staging")
      DOCKER_IMAGE_TAG="staging-v${APP_VERSION}"
      BUILD_MODE="staging"
      ;;
    "main")
      DOCKER_IMAGE_TAG="latest"
      BUILD_MODE="production"
      ;;
    *)
      echo "❌ Error: Cannot build from branch '$git_branch'."
      echo "   Docker build and push is restricted to 'main' or 'staging' branches."
      exit 1
      ;;
  esac

  echo "✅ Building with tag: ${DOCKER_IMAGE_TAG}"
  docker_login
  build_images
  push_images
  clean_up
  echo "🎉  All tasks completed successfully!"
}

# Run the script with the provided mode
main
