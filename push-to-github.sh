#!/usr/bin/env bash
# One-shot: point this repo at your GitHub repo and push.
#
#   bash push-to-github.sh YOUR-GITHUB-USERNAME [repo-name]
#
# Create the empty repo on github.com FIRST (New repository, do NOT tick
# "Add a README" — this repo already has one and the extra commit causes a
# rejected push).
set -euo pipefail

USER="${1:-}"
REPO="${2:-quizarena}"

if [ -z "$USER" ]; then
  echo "Usage: bash push-to-github.sh YOUR-GITHUB-USERNAME [repo-name]" >&2
  echo "  e.g. bash push-to-github.sh pabasara-imadu quizarena" >&2
  exit 1
fi

case "$USER" in
  YOUR-USERNAME|your-username|USERNAME)
    echo "That is the placeholder, not your username. Use your real GitHub username." >&2
    exit 1
    ;;
esac

git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$USER/$REPO.git"

echo "Pushing to https://github.com/$USER/$REPO.git (branch: main)"
git push -u origin main

echo
echo "Done. Verify render.yaml is visible here:"
echo "  https://github.com/$USER/$REPO/blob/main/render.yaml"
