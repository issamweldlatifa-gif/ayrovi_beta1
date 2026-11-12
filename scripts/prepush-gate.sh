#!/usr/bin/env bash
# Porte locale avant `git push` — rejoue EXACTEMENT les étapes rouges de la CI
# (mobile-android.yml / mobile.yml « Porte », ci.yml « Typecheck + Test »).
#
# Pourquoi : chaque échec de la CI de novembre 2026 (37e086a2, 7dd807a7,
# f87d5d05) venait d'un commit poussé après des tests CIBLÉS seulement — la
# suite complète (accessibilité, copie morte…) n'avait pas tourné. La porte
# refuse le push tant que la suite complète n'est pas verte.
#
# Ne lance que ce qui concerne les fichiers modifiés :
#   apps/mobile/** ou shared/**          → porte mobile (jetons, tsc, vitest, jest)
#   src/** client/** shared/** tests/**  → porte racine (tsc, vitest)
# Contournement explicite (urgence) : SKIP_PREPUSH_GATE=1 git push …
set -euo pipefail

if [[ "${SKIP_PREPUSH_GATE:-}" == "1" ]]; then
  echo "[porte] ignorée (SKIP_PREPUSH_GATE=1)"; exit 0
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# Base de comparaison : la branche distante si elle existe, sinon main.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if git rev-parse --verify -q "origin/$BRANCH" >/dev/null; then BASE="origin/$BRANCH";
elif git rev-parse --verify -q origin/main >/dev/null; then BASE="$(git merge-base HEAD origin/main)";
else BASE="HEAD~1"; fi
CHANGED="$(git diff --name-only "$BASE"...HEAD 2>/dev/null || git diff --name-only "$BASE" HEAD)"

if [[ -z "$CHANGED" ]]; then echo "[porte] aucun fichier modifié depuis $BASE"; exit 0; fi

run() { echo; echo "[porte] ▶ $*"; "$@"; }

if grep -qE '^(apps/mobile/|shared/)' <<<"$CHANGED"; then
  echo "[porte] mobile : fichiers modifiés → jetons, typecheck, vitest, jest"
  (
    cd apps/mobile
    run npm run --silent tokens:check
    run npx tsc --noEmit
    run npx vitest run --reporter=dot
    run npx jest --config jest.config.js --forceExit --silent
  )
fi

if grep -qE '^(src/|client/|shared/|tests/|package\.json)' <<<"$CHANGED"; then
  echo "[porte] racine : fichiers modifiés → typecheck, vitest"
  run npm run --silent typecheck
  [[ -f public/index.html ]] || run npm run --silent build
  run npx vitest run --reporter=dot
fi

echo; echo "[porte] ✓ tout est vert — push autorisé"
