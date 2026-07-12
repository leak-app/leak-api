#!/bin/bash

set -euo pipefail

# Please create a .github_token file in the home directory with the following content:
GITHUB_USERNAME=${GITHUB_USERNAME:-tiendat77}
GITHUB_PASSWORD=${GITHUB_PASSWORD:-$(cat ~/.github_token)}

# Default variables
APP_NAME="leak-api"
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
DOCKER_IMAGE_NAME="${DOCKER_REGISTRY}/${REPOSITORY_OWNER}/${APP_NAME}"
DOCKER_IMAGE_TAG="latest"
BUILD_MODE="development"

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
  echo "🗝️  Logging in to GitHub Container Registry\n"

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

build_image() {
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
  echo "🐳  Building Docker image with tags: ${DOCKER_IMAGE_TAG} & ${APP_VERSION}\n"

  docker build \
    -t "${DOCKER_IMAGE_NAME}:${DOCKER_IMAGE_TAG}" \
    -t "${DOCKER_IMAGE_NAME}:${APP_VERSION}" \
    --build-arg BUILD_MODE=${BUILD_MODE} \
    --platform 'linux/amd64' \
    -f Dockerfile . || {
      echo "❌ Build failed!"
      exit 1
    }
}

push_image() {
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
  echo "🚀  Pushing Docker image to GitHub Container Registry\n"

  docker push "${DOCKER_IMAGE_NAME}:${DOCKER_IMAGE_TAG}" || {
    echo "❌ Push failed for ${DOCKER_IMAGE_TAG}!"
    exit 1
  }

  docker push "${DOCKER_IMAGE_NAME}:${APP_VERSION}" || {
    echo "❌ Push failed for ${APP_VERSION}!"
    exit 1
  }
}

clean_up() {
  echo "🪠  Clean up docker build shit \n"

  docker rmi "${DOCKER_IMAGE_NAME}:${DOCKER_IMAGE_TAG}" || echo "⚠️ Could not remove ${DOCKER_IMAGE_TAG} image"

  docker rmi "${DOCKER_IMAGE_NAME}:${APP_VERSION}" || echo "⚠️ Could not remove ${APP_VERSION} image"
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
  build_image
  push_image
  clean_up
  echo "🎉  All tasks completed successfully!"
}

# Run the script with the provided mode
main
