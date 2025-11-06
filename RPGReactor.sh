#!/bin/bash
# RPG Reactor Launcher Script

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the project directory
cd "$SCRIPT_DIR"

# Launch the application using Linux-specific NW.js binaries
./nwjs-linux/nw .
