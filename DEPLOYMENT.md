# OpenVigie Docker Deployment

## Quick Start (Production)

```bash
# Pull the latest images
docker pull swapshadow/openvigie-web:latest
docker pull swapshadow/openvigie-collector:latest

# Run with docker-compose (production optimized)
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps
```

## Images

- **Web**: `swapshadow/openvigie-web:latest`
- **Collector**: `swapshadow/openvigie-collector:latest`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Docker Host                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │     Web      │  │  Collector   │  │    Ollama    │       │
│  │  (port 3000) │  │ (port 8787)  │  │(port 11434)  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                 │                  │                │
│         └─────────────────┼──────────────────┘                │
│                           │                                   │
│                   ┌───────▼────────┐                          │
│                   │  Shared Data   │                          │
│                   │  (SQLite, etc) │                          │
│                   └────────────────┘                          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Environment Variables

```bash
# .env file
# Mistral 7B Instruct: ~4.1 GB, meilleur français, recommandé.
OLLAMA_MODEL=mistral:7b-instruct
OLLAMA_PORT=11434
OLLAMA_CONTEXT_LENGTH=2048
OLLAMA_NUM_PARALLEL=1
```

## Logs

```bash
# View all logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service
docker compose -f docker-compose.prod.yml logs -f web
```

## Health Checks

Each service has built-in health checks:
- **Web**: HTTP 200 on `http://localhost:3000`
- **Collector**: HTTP 200 on `http://localhost:8787/health`
- **Ollama**: HTTP 200 on `http://localhost:11434/api/tags`

## CI/CD Pipeline

GitHub Actions automatically:
1. Builds Docker images on push to `main`
2. Tags with branch name, commit SHA, and `latest`
3. Pushes to Docker Hub under `swapshadow/`

**Required GitHub Secrets**:
- `DOCKER_USERNAME`: Your Docker Hub username
- `DOCKER_PASSWORD`: Your Docker Hub access token

## Local Development

```bash
# Use the development compose
docker compose up -d

# Build with local changes
docker compose build --no-cache web
docker compose up -d web
```

## GPU Acceleration (NVIDIA)

Ollama runs on CPU by default — `docker compose up` alone is unaffected by any
of this. On Windows or Linux with an NVIDIA GPU, `scripts/detect_gpu.py` checks
for `nvidia-smi` and a registered `nvidia` Docker runtime; `./start.sh` /
`.\start.ps1` use it to decide whether to layer `compose.gpu.yml` on top of
`compose.yaml`. `compose.gpu.yml` only adds a GPU device reservation to the
`ollama` service and is never applied unless explicitly requested:

```bash
docker compose -f compose.yaml -f compose.gpu.yml up -d --build
```

Requires the NVIDIA Container Toolkit on Linux, or GPU support enabled under
Docker Desktop's *Settings > Resources > GPU* on Windows (WSL2 backend).

**macOS**: Docker Desktop cannot expose a GPU to containers on macOS (Apple
Silicon or Intel) — a Docker Desktop virtualization limitation, not something
this project's configuration can change. `start.sh` detects macOS and always
runs Ollama on CPU there, with an explanatory message instead of attempting
`compose.gpu.yml`.

If `ollama` was already running in CPU mode, switching to GPU (or back) needs
that one container recreated so the device reservation actually takes effect —
`deploy.resources` changes are not always picked up as a reason to recreate an
already-running container:

```bash
docker compose -f compose.yaml -f compose.gpu.yml up -d --force-recreate --no-deps ollama
```

(`start.sh` / `start.ps1` already do this automatically.)

## Production Notes

- Images run as non-root user (`nextjs` for web, `collector` for collector)
- Multi-stage builds optimize image size
- Health checks enable automatic container restart
- All services restart unless manually stopped
- Volumes persist data across container restarts


## HTTPS local renouvelé automatiquement (Caddy)

`docker compose up -d --build` démarre aussi Caddy. Utilisez **https://localhost**
ou **https://127.0.0.1**. **http://localhost:3000 reste disponible en parallèle**.
Le port HTTPS est lié uniquement à 127.0.0.1. Si le port 443 est occupé, définissez
`OPENVIGIE_HTTPS_PORT=8443` dans `.env`, puis utilisez `https://localhost:8443`.
Les noms et adresses du réseau local ne sont pas couverts par cette configuration.
Le même service est inclus dans `docker-compose.prod.yml`.

Caddy utilise `tls internal` : il crée une autorité locale, puis renouvelle les
certificats du site et son intermédiaire automatiquement pendant son fonctionnement.
Aucun certificat du site à recréer manuellement, aucune dépendance à une autorité
publique ou à une validation DNS. Les volumes `openvigie_caddy_data` et
`openvigie_caddy_config` conservent l’identité TLS entre les redémarrages.
Ne supprimez pas ces volumes pendant les mises à jour.

### Faire confiance à l’autorité locale une seule fois

Un navigateur ne fait pas confiance par défaut à une autorité créée dans Docker.
Exportez **uniquement le certificat public racine**, jamais les clés privées :

```bash
mkdir -p .local
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt .local/caddy-root.crt
```

Sous PowerShell, utilisez `New-Item -ItemType Directory -Force .local` à la place
de `mkdir -p`. Installez ensuite ce certificat dans le magasin de confiance :

- Windows (utilisateur courant, sans administrateur) :
  `Import-Certificate -FilePath .local/caddy-root.crt -CertStoreLocation Cert:\CurrentUser\Root`
- macOS : importez `.local/caddy-root.crt` dans Trousseaux d’accès et faites
  confiance à cette autorité pour SSL.
- Linux Debian/Ubuntu : copiez-le dans
  `/usr/local/share/ca-certificates/openvigie-local.crt`, puis exécutez
  `sudo update-ca-certificates`.
- Firefox peut nécessiter un import dans son propre magasin d’autorités.

Cette confiance initiale est indépendante des renouvellements automatiques des
certificats du site. Si vous supprimez le volume Caddy, une nouvelle autorité sera
créée et devra être approuvée à nouveau. La racine a elle-même une durée de vie
longue et finie : son remplacement exceptionnel nécessitera une nouvelle confiance.
Ne distribuez pas le volume contenant sa clé privée.

### Vérifications

```bash
docker compose config --quiet
docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
curl --cacert .local/caddy-root.crt https://localhost/api/notifications
curl http://localhost:3000/api/notifications
```

En cas de refus d’une écriture HTTPS dans les paramètres, vérifiez que le service
web a été recréé : `OPENVIGIE_PUBLIC_ORIGINS` autorise explicitement les deux
origines HTTPS locales et le port choisi. Les origines étrangères restent refusées.
Les certificats ne sont pas versionnés. Documentation Caddy :
https://caddyserver.com/docs/automatic-https#local-https.
