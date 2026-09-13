#!/usr/bin/env bash
set -e
# Create virtualenv in .venv if it doesn't exist
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
# Activate and install requirements
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "AI environment ready. Start the AI server with:"
echo "  source .venv/bin/activate && python ai_server.py"
