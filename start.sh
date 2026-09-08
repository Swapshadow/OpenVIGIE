#!/usr/bin/env bash
# Optional convenience wrapper: detects an NVIDIA GPU and, when Docker can
# actually use it, launches with the GPU override on top of the normal
# compose.yaml. Purely additive — `docker compose up -d --build` on its own
# keeps working exactly as before, in CPU mode. Use this script if you just
# want the fastest Vigi without thinking about it.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

PYTHON_BIN=""
# `py` (Windows' official launcher, also reachable from Git Bash/WSL interop)
# is checked first: on stock Windows, `python3`/`python` resolve to Microsoft
# Store app-execution alias stubs that exist on PATH but do not run Python at
# all — they exit non-zero silently, which the --version check below catches,
# but only `py` is guaranteed to actually work there.
for candidate in py python3 python; do
  # Check the candidate actually runs, not just that it's on PATH: a stub
  # (e.g. a broken shim or alias) can exist without being real Python, which
  # would otherwise be silently misread as "no GPU found".
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" --version >/dev/null 2>&1; then
    PYTHON_BIN="$candidate"
    break
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "Python introuvable ou non fonctionnel : impossible de détecter le GPU, lancement en mode CPU."
  exec docker compose up -d --build
fi

if "$PYTHON_BIN" scripts/detect_gpu.py; then
  echo "GPU NVIDIA détecté - Vigi utilisera l'accélération matérielle."
  COMPOSE_FILES=(-f compose.yaml -f compose.gpu.yml)
else
  echo "Aucun GPU compatible détecté - Vigi fonctionnera en mode CPU."
  COMPOSE_FILES=(-f compose.yaml)
fi

docker compose "${COMPOSE_FILES[@]}" up -d --build
# `deploy.resources` (GPU reservation) isn't always picked up as a reason to
# recreate an already-running container, so an existing CPU-mode ollama could
# silently stay CPU-only after switching to GPU (or vice versa). Force it
# specifically, without restarting collector/web, so the two always agree
# with what detect_gpu.py just decided.
exec docker compose "${COMPOSE_FILES[@]}" up -d --force-recreate --no-deps ollama
