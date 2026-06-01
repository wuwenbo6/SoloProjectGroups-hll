#!/bin/bash

set -e

NOVNC_VERSION="1.4.0"
NOVNC_DIR="static/novnc"

echo "Downloading noVNC v${NOVNC_VERSION}..."

mkdir -p "${NOVNC_DIR}"

curl -L "https://github.com/novnc/noVNC/archive/v${NOVNC_VERSION}.tar.gz" | tar xz --strip-components=1 -C "${NOVNC_DIR}"

echo "noVNC downloaded to ${NOVNC_DIR}"
echo "Done!"
