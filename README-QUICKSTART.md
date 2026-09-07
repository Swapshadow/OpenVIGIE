# OpenVigie — Déploiement Cross-Platform

OpenVigie est une plateforme de **veille cybersécurité** avec IA locale (Mistral 7B Instruct — ~4.1 GB, meilleur français, recommandé). Deploy en 1 commande sur **Windows, macOS ou Linux**.

## 🚀 Démarrage Rapide

### Prérequis
- **Docker Desktop** installé
  - [Windows](https://docs.docker.com/desktop/install/windows-install/)
  - [macOS](https://docs.docker.com/desktop/install/mac-install/)
  - [Linux](https://docs.docker.com/engine/install/)
- **8 GB de RAM minimum** pour Mistral 7B Instruct
- **5 GB d'espace disque** pour les images

### Lancer le projet (Tous les OS)

```bash
# 1. Cloner le repo
git clone https://github.com/Swapshadow/openvigie.git
cd openvigie

# 2. Démarrer la stack
docker compose -f docker-compose.prod.yml up -d

# 3. Attendre 2-3 min le démarrage d'Ollama...
docker compose -f docker-compose.prod.yml logs -f ollama

# 4. Accéder à l'application
# → http://localhost:3000
```

## 📋 Détails par OS

### macOS
```bash
# Intel ou Apple Silicon (M1/M2/M3) — compatible
docker --version  # Vérifier Docker Desktop actif
docker compose -f docker-compose.prod.yml up -d
open http://localhost:3000
```

### Windows (PowerShell)
```powershell
# Docker Desktop doit tourner
docker --version
docker compose -f docker-compose.prod.yml up -d
# Ouvrir http://localhost:3000 dans le navigateur
```

### Linux (Ubuntu/Debian)
```bash
# Installer Docker (si pas déjà fait)
sudo apt-get update
sudo apt-get install -y docker.io docker-compose

# Démarrer
sudo docker compose -f docker-compose.prod.yml up -d
# http://localhost:3000
```

## 🛑 Arrêter l'application

```bash
docker compose -f docker-compose.prod.yml down
```

## 📊 Architecture

- **Web** (Next.js) → http://localhost:3000
- **Collector** (Python) → http://localhost:8787
- **Ollama** (Mistral 7B Instruct) → http://localhost:11434

## 🆘 Problèmes courants

### Docker ne démarre pas
```bash
# Vérifier que Docker Desktop est lancé
docker ps
```

### Disque plein
```bash
# Nettoyer
docker system prune -a --volumes
```

### Ollama très lent
- Premier démarrage : ~5-10 min (télécharge le modèle)
- Ensuite : ~2 min de warm-up
- **Besoin de 8 GB RAM minimum**

## 📚 Documentation complète

Voir [DEPLOYMENT.md](DEPLOYMENT.md) pour la configuration avancée.

## 📦 Images Docker

Images disponibles sur Docker Hub :
```bash
docker pull swapshadow/openvigie-web:latest
docker pull swapshadow/openvigie-collector:latest
```

---

**Version**: 1.0.0 | **Modèle IA**: Mistral 7B Instruct (local)


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
