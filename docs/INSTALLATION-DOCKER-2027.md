# Installer OpenVIGIE 2027 avec Docker

Ce guide s'adresse à une installation locale sur Windows avec Docker Desktop, ou sur Linux/macOS avec Docker et Docker Compose. Le dépôt doit être accessible à votre compte GitHub pour pouvoir le cloner.

## Première installation

1. Installer et démarrer Docker Desktop (ou Docker Engine et le module Compose). Prévoir environ 8 Go de mémoire pour l'assistant IA local ; le GPU est facultatif.
2. Récupérer la release :

   ```bash
   git clone https://github.com/Swapshadow/OpenVIGIE.git
   cd OpenVIGIE
   git checkout v2027.0.0
   ```

3. Copier `.env.example` vers `.env` (`Copy-Item .env.example .env` dans PowerShell, ou `cp .env.example .env` sous Linux/macOS). Garder ce fichier privé. La clé `NVD_API_KEY` est facultative, mais améliore le débit des appels NVD. Pour activer les alertes email, définir une valeur aléatoire persistante d'au moins 32 caractères dans `OPENVIGIE_SECRET_KEY` ; ne jamais partager cette clé.
4. Depuis la racine du dépôt, démarrer l'application :

   ```bash
   docker compose up -d --build
   docker compose ps
   ```

   Le premier démarrage peut durer pendant le téléchargement des images et du modèle IA. L'interface est disponible sur <http://localhost:3000/> ; le proxy HTTPS local est disponible sur <https://localhost/> (certificat local à approuver dans le navigateur).
5. Créer le premier compte et nommer son organisation dans l'écran d'accueil. Ajouter les équipements du parc avec leur version exacte. Chaque organisation configure ses propres destinataires et son SMTP dans **Alertes email** ; rien n'est prérempli depuis le dépôt.

La liste des versions CPE provient de la NVD du NIST. Les grandes listes sont chargées en arrière-plan et mises en cache ; la version exacte peut aussi être saisie manuellement. Une version trop vague, notamment pour Windows Server 2022, ne permet pas une corrélation fiable.

## Mettre à jour sans perdre les données

La base SQLite et les modèles IA sont conservés dans des volumes Docker nommés. Avant une mise à jour, sauvegarder le volume de données. Depuis la racine du dépôt, sous PowerShell :

```powershell
docker run --rm -v openvigie_openvigie_data:/data -v ${PWD}:/backup alpine tar czf /backup/openvigie-data-backup.tgz -C /data .
```

Puis récupérer la release et reconstruire :

```bash
git fetch --tags
git checkout v2027.0.0
docker compose up -d --build
docker compose ps
```

Ne pas utiliser `docker compose down -v` : `-v` supprimerait les volumes. Conserver aussi une copie privée de `.env`, en particulier de `OPENVIGIE_SECRET_KEY`. Si vous venez d'une version antérieure à 2027, reconfigurer les alertes email dans chaque organisation : les anciens réglages SMTP globaux restent dans le volume local, mais ne sont pas attribués aux nouveaux comptes ni utilisés pour leurs envois.

## Vérifier et dépanner

- `docker compose ps` doit montrer `collector` en état *healthy* et `web` en fonctionnement.
- `docker compose logs --tail=100 collector web` affiche les erreurs de démarrage sans révéler les mots de passe SMTP.
- Si le port 3000 ou 443 est occupé, libérer le port avant de relancer Compose. Le port HTTPS peut être changé avec `OPENVIGIE_HTTPS_PORT` dans `.env`.
- Pour arrêter sans supprimer les données : `docker compose down`.

Pour les règles de corrélation CVE et les garanties d'isolation, voir [OPENVIGIE-2027.md](OPENVIGIE-2027.md).
