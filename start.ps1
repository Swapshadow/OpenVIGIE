# Optional convenience wrapper: detects an NVIDIA GPU and, when Docker can
# actually use it, launches with the GPU override on top of the normal
# compose.yaml. Purely additive - `docker compose up -d --build` on its own
# keeps working exactly as before, in CPU mode. Use this script if you just
# want the fastest Vigi without thinking about it.
Set-Location -Path $PSScriptRoot

function Resolve-WorkingPython {
    # `py` (the official launcher) is checked first: on a stock Windows
    # install, `python`/`python3` resolve to Microsoft Store app-execution
    # alias stubs (%LOCALAPPDATA%\Microsoft\WindowsApps\python*.exe) that
    # Get-Command happily finds but that do not run Python at all - they
    # silently fail, which would otherwise be misread as "no GPU found"
    # instead of "couldn't check". Actually invoking --version, not just
    # checking PATH presence, is what catches that.
    foreach ($name in @('py', 'python3', 'python')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if (-not $cmd) { continue }
        try {
            & $cmd.Source --version *> $null
            if ($LASTEXITCODE -eq 0) { return $cmd.Source }
        } catch {
            continue
        }
    }
    return $null
}

$pythonBin = Resolve-WorkingPython
if (-not $pythonBin) {
    Write-Output "Python introuvable ou non fonctionnel : impossible de détecter le GPU, lancement en mode CPU."
    docker compose up -d --build
    exit $LASTEXITCODE
}

& $pythonBin scripts\detect_gpu.py
if ($LASTEXITCODE -eq 0) {
    Write-Output "GPU NVIDIA détecté - Vigi utilisera l'accélération matérielle."
    $composeFiles = @('-f', 'compose.yaml', '-f', 'compose.gpu.yml')
} else {
    Write-Output "Aucun GPU compatible détecté - Vigi fonctionnera en mode CPU."
    $composeFiles = @('-f', 'compose.yaml')
}

docker compose @composeFiles up -d --build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
# `deploy.resources` (GPU reservation) isn't always picked up as a reason to
# recreate an already-running container, so an existing CPU-mode ollama could
# silently stay CPU-only after switching to GPU (or vice versa). Force it
# specifically, without restarting collector/web, so the two always agree
# with what detect_gpu.py just decided.
docker compose @composeFiles up -d --force-recreate --no-deps ollama
exit $LASTEXITCODE
