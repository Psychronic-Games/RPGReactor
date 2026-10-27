#!/bin/sh
# A headless display for the perf tools and game harnesses, on the real GPUs.
#
# Starts a second KWin with a virtual 1920x1080 output and its own Xwayland,
# under its own D-Bus session, so harness windows never reach the desktop.
# Prints the X display it made (":1" when the desktop holds ":0").
#
#   editor/tests/perf/headless-display.sh &          # leave it running
#   DISPLAY=:1 XAUTHORITY= XDG_SESSION_TYPE=x11 env -u WAYLAND_DISPLAY \
#       node editor/tests/perf/nw-frame-breakdown.cjs --project=<copy> ...
#
# The window draws on the integrated GPU (the weak tier on a Ryzen APU). For
# the NVIDIA card add: __NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia
# Run NW.js as an X11 client there, not a Wayland one: on a headless Wayland
# socket Chromium falls back to software rendering.
#
# Never ask Dropbox for its status from a harness script: on this machine the
# `dropbox` command is the launcher and restarts the running client.
set -e
list() { ls /tmp/.X11-unix 2>/dev/null | sort; }
before=$(list)
dbus-run-session -- kwin_wayland --virtual --width "${RR_DISPLAY_WIDTH:-1920}" --height "${RR_DISPLAY_HEIGHT:-1080}" \
    --no-lockscreen --no-global-shortcuts --socket "wayland-rr-$$" --xwayland &
pid=$!
trap 'pkill -P $pid 2>/dev/null; kill $pid 2>/dev/null' INT TERM EXIT
# KWin opens two sockets: Xwayland's display and, one number up, an init
# display that never answers a client. The lower new number is the one to use.
made=
for i in $(seq 1 100); do
    for name in $(list); do
        case "
$before
" in *"
$name
"*) ;; *) if [ -z "$made" ] || [ "${name#X}" -lt "${made#X}" ]; then made=$name; fi ;; esac
    done
    [ -n "$made" ] && break
    kill -0 $pid 2>/dev/null || { echo "kwin_wayland --virtual did not start" >&2; exit 1; }
    sleep 0.1
done
if [ -n "$made" ]; then echo ":${made#X}"; else echo "started, but no new X display appeared within 10 s" >&2; fi
wait $pid
