#!/bin/bash
# Convenience launcher for source checkouts. The NW.js app lives in editor/.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
exec "$SCRIPT_DIR/editor/RPGReactor.command" "$@"
