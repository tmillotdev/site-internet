# Site Timothée Millot Développement

Site statique (HTML/CSS/JS).

## Déploiement

Chaque push sur `main` déploie automatiquement le site sur l'hébergement OVH
via SFTP (workflow `.github/workflows/deploy.yml`). On peut aussi relancer un
déploiement à la main depuis l'onglet **Actions** du dépôt (« Run workflow »).

Secrets GitHub nécessaires (Settings → Secrets and variables → Actions) :

| Nom | Valeur |
| --- | --- |
| `OVH_SFTP_HOST` | `ftp.cluster129.hosting.ovh.net` |
| `OVH_SFTP_USER` | `timothc` |
| `OVH_SFTP_PASSWORD` | mot de passe SFTP OVH (jamais dans le code) |

Variable optionnelle : `OVH_REMOTE_DIR` (dossier distant, `www` par défaut).

Le déploiement ajoute et met à jour les fichiers, mais ne supprime rien sur le
serveur : un fichier retiré du dépôt doit être supprimé à la main sur OVH.
