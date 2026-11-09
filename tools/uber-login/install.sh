#!/usr/bin/env bash
# Installs the Uber self-sign-in job on this Mac (launchd user agent).
# Re-run after editing the plist. Needs: Google Chrome, node at /usr/local/bin/node,
# ssh key access to the Kitchen droplet as root (the deploy key already used here).
set -euo pipefail
cd "$(dirname "$0")"
npm install --no-audit --no-fund >/dev/null
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/C/tarte-loose-ends/uber-login-profile"
cp com.tarte.uber-login.plist "$HOME/Library/LaunchAgents/com.tarte.uber-login.plist"
launchctl bootout "gui/$(id -u)/com.tarte.uber-login" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.tarte.uber-login.plist"
launchctl print "gui/$(id -u)/com.tarte.uber-login" | grep -E "state|program|run interval|calendar" | head -5 || true
echo "Installed. Log: $HOME/C/tarte-loose-ends/uber-login.log. Run now: launchctl kickstart gui/$(id -u)/com.tarte.uber-login"
