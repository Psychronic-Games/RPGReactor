#!/bin/bash
# RPG Reactor Launcher Script

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the project directory
cd "$SCRIPT_DIR"

# Auto-install desktop entry and icon on first run (or if missing)
if [ ! -f "$HOME/.local/share/applications/rpg-reactor.desktop" ] || [ ! -f "$HOME/.local/share/icons/hicolor/1024x1024/apps/rpg-reactor.png" ]; then
    echo "Installing desktop entry and icon for proper taskbar icon display..."

    # Create directories if they don't exist
    mkdir -p "$HOME/.local/share/applications"
    mkdir -p "$HOME/.local/share/icons/hicolor/1024x1024/apps"

    # Copy icon to standard location
    cp "$SCRIPT_DIR/images/icon.png" "$HOME/.local/share/icons/hicolor/1024x1024/apps/rpg-reactor.png"

    # Create desktop entry with absolute paths
    cat > "$HOME/.local/share/applications/rpg-reactor.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=RPG Reactor
Comment=Open-source RPG game engine
Exec="$SCRIPT_DIR/RPGReactor.sh"
Icon=$HOME/.local/share/icons/hicolor/1024x1024/apps/rpg-reactor.png
Terminal=false
Categories=Development;Game;
StartupWMClass=rpg-reactor
EOF

    # Update desktop database
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

    # Update icon cache
    gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

    echo "✓ Desktop entry and icon installed successfully"
fi

# Set the window icon (Linux window managers may use this)
export WINDOW_ICON="$SCRIPT_DIR/images/icon.png"

# Set the WMClass to match the .desktop file for proper icon association
export BAMF_DESKTOP_FILE_HINT="$HOME/.local/share/applications/rpg-reactor.desktop"

# Pick a separate Chromium/NW profile for each live editor instance.
# Without this, a second launch can be routed back into the first process.
PROFILE_BASE="${XDG_CONFIG_HOME:-$HOME/.config}/rpg-reactor/instances"
mkdir -p "$PROFILE_BASE"

INSTANCE_PROFILE=""
INSTANCE_LOCK=""

for slot in {1..16}; do
    candidate_profile="$PROFILE_BASE/instance-$slot"
    candidate_lock="$PROFILE_BASE/instance-$slot.lock"

    if mkdir "$candidate_lock" 2>/dev/null; then
        INSTANCE_PROFILE="$candidate_profile"
        INSTANCE_LOCK="$candidate_lock"
        break
    fi

    if [ -f "$candidate_lock/pid" ]; then
        old_pid="$(cat "$candidate_lock/pid" 2>/dev/null)"
        if [ -n "$old_pid" ] && ! kill -0 "$old_pid" 2>/dev/null; then
            rm -rf "$candidate_lock"
            if mkdir "$candidate_lock" 2>/dev/null; then
                INSTANCE_PROFILE="$candidate_profile"
                INSTANCE_LOCK="$candidate_lock"
                break
            fi
        fi
    fi
done

if [ -z "$INSTANCE_PROFILE" ]; then
    INSTANCE_PROFILE="$PROFILE_BASE/instance-$$"
    INSTANCE_LOCK="$PROFILE_BASE/instance-$$.lock"
    mkdir -p "$INSTANCE_LOCK"
fi

mkdir -p "$INSTANCE_PROFILE"
echo $$ > "$INSTANCE_LOCK/pid"

cleanup_instance_lock() {
    if [ -n "$INSTANCE_LOCK" ]; then
        rm -rf "$INSTANCE_LOCK"
    fi
}
trap cleanup_instance_lock EXIT

# Launch the application using Linux-specific NW.js binaries with icon
# The --class parameter helps Linux window managers associate the window with the .desktop file
./nwjs-linux/nw --user-data-dir="$INSTANCE_PROFILE" --class=rpg-reactor . --icon="$SCRIPT_DIR/images/icon.png"
