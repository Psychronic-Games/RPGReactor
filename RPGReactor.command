#!/bin/bash
# RPG Reactor Launcher Script for macOS

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the project directory
cd "$SCRIPT_DIR"

# Launch the application using macOS-specific NW.js binaries
# macOS uses .app bundle structure
./nwjs-mac/nwjs.app/Contents/MacOS/nwjs .
