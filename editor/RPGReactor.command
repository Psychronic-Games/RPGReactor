#!/bin/bash
# RPG Reactor Launcher Script for macOS

# Get the directories used by source checkouts and packaged builds.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
APP_DIR="$SCRIPT_DIR"

if [ -x "$APP_DIR/nwjs-mac/nwjs.app/Contents/MacOS/nwjs" ]; then
    NW_BINARY="$APP_DIR/nwjs-mac/nwjs.app/Contents/MacOS/nwjs"
elif [ -x "$REPO_DIR/nwjs-mac/nwjs.app/Contents/MacOS/nwjs" ]; then
    NW_BINARY="$REPO_DIR/nwjs-mac/nwjs.app/Contents/MacOS/nwjs"
else
    echo "Could not find NW.js. Expected nwjs-mac/nwjs.app in:"
    echo "  $APP_DIR"
    echo "  $REPO_DIR"
    exit 1
fi

# Change to the project directory
cd "$APP_DIR"

# Launch the application using macOS-specific NW.js binaries
# macOS uses .app bundle structure
"$NW_BINARY" .
