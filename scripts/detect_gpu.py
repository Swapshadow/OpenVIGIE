#!/usr/bin/env python3
"""Detect whether Ollama can use GPU acceleration in this Docker setup.

Single cross-platform detector for start.sh / start.ps1 (avoids maintaining
duplicate detection logic in bash and PowerShell). Never raises: any
uncertainty resolves to "use CPU", matching the project's "never break the
default CPU path" rule.

Exit code 0  -> GPU acceleration usable, caller should add compose.gpu.yml.
Exit code 1  -> CPU only (no GPU, missing toolkit, or macOS).
Human-readable diagnostics are printed to stdout in both cases.

macOS note: Docker Desktop cannot pass a GPU through to Linux containers on
Apple Silicon (or Intel Macs) — this is a Docker Desktop/virtualization
limitation, not something a script or container config can work around.
Ollama therefore always runs on CPU on macOS; this is documented, not "fixed".
"""

from __future__ import annotations

import json
import platform
import shutil
import subprocess
import sys

TIMEOUT_SECONDS = 6

# Windows consoles often default stdout to a legacy codepage (cp1252/cp850),
# which mangles the accented French diagnostics below. Force UTF-8 when the
# interpreter supports it (3.7+); harmless no-op elsewhere.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


def run(command: list[str]) -> tuple[int, str]:
    """Run a command with a short timeout. Never raises; (-1, "") on any failure."""
    try:
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=TIMEOUT_SECONDS, check=False,
        )
        return result.returncode, (result.stdout or "") + (result.stderr or "")
    except Exception:
        return -1, ""


def cpu(reason: str) -> int:
    print(f"CPU uniquement : {reason}")
    return 1


def gpu(reason: str) -> int:
    print(f"GPU disponible : {reason}")
    return 0


def main() -> int:
    system = platform.system()

    if system == "Darwin":
        return cpu(
            "macOS détecté. Docker Desktop ne peut pas exposer un GPU (Apple Silicon ou "
            "Intel) aux conteneurs Linux — limitation de la virtualisation Docker Desktop, "
            "pas un bug OpenVigie. Ollama tournera en CPU ; voir README-QUICKSTART.md."
        )

    if system not in ("Linux", "Windows"):
        return cpu(f"Système '{system}' non reconnu pour l'accélération GPU — CPU par défaut.")

    if not shutil.which("nvidia-smi"):
        return cpu("aucun pilote NVIDIA détecté (nvidia-smi introuvable).")

    code, _ = run(["nvidia-smi"])
    if code != 0:
        return cpu("nvidia-smi présent mais a échoué (pilote NVIDIA non fonctionnel).")

    if not shutil.which("docker"):
        return cpu("GPU NVIDIA détecté, mais la commande docker est introuvable.")

    code, output = run(["docker", "info", "--format", "{{json .Runtimes}}"])
    if code != 0:
        return cpu("GPU NVIDIA détecté, mais impossible d'interroger Docker (docker info a échoué).")

    try:
        runtimes = json.loads(output)
    except json.JSONDecodeError:
        runtimes = {}

    if "nvidia" in runtimes:
        return gpu("GPU NVIDIA détecté et le runtime 'nvidia' est enregistré dans Docker.")

    if system == "Linux":
        hint = (
            "installez le NVIDIA Container Toolkit : "
            "https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
        )
    else:
        hint = (
            "activez le support GPU dans Docker Desktop (Settings > Resources > GPU) — "
            "nécessite un pilote NVIDIA récent et le backend WSL2."
        )
    return cpu(f"GPU NVIDIA détecté mais le runtime 'nvidia' n'est pas enregistré dans Docker ; {hint}")


if __name__ == "__main__":
    sys.exit(main())
