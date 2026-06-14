#!/bin/bash
# Install RPG Reactor desktop entry and icon for proper taskbar icon

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Create directories if they don't exist
mkdir -p "$HOME/.local/share/applications"
mkdir -p "$HOME/.local/share/icons/hicolor/1024x1024/apps"

# Copy icon to standard location
cp "$SCRIPT_DIR/images/icon.png" "$HOME/.local/share/icons/hicolor/1024x1024/apps/rpg-reactor.png"

# Create desktop entry with absolute paths (properly quoted)
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

echo "✓ Desktop entry installed to ~/.local/share/applications/rpg-reactor.desktop"
echo "✓ Icon installed to ~/.local/share/icons/hicolor/1024x1024/apps/rpg-reactor.png"
echo ""
echo "Please close RPG Reactor if it's running, then launch it from your application menu."
echo "The taskbar icon should now display correctly."
