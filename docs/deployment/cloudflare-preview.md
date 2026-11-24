# Previews Cloudflare par pull request

Cette configuration déploie une preview du frontend sur Cloudflare Pages et
une API Hono sur Cloudflare Workers pour chaque pull request interne.

## Architecture

- Supabase fournit le PostgreSQL de recette.
- Un schéma `preview_pr_<numéro>` est créé dans ce projet pour chaque PR.
- Hyperdrive expose la connexion PostgreSQL au Worker.
- Le Worker fixe le `search_path` sur le schéma de la PR.
- Le Worker n’autorise les appels navigateur que depuis l’URL Pages de la même PR.
- Les migrations et les données de démonstration restent fictives.
- Les PR provenant d’un fork n’utilisent aucun secret et ne sont pas déployées.

Le plan gratuit Supabase suffit pour une première démonstration, mais il limite
le nombre de projets actifs et peut mettre en pause les projets inactifs. La
séparation par schéma permet plusieurs PR sans créer un projet Supabase par PR.

## Prérequis

1. Créer un projet Supabase dédié à la recette et récupérer une URL PostgreSQL.
2. Créer une configuration Hyperdrive pointant vers cette URL.
3. Le workflow crée automatiquement, si nécessaire, un projet Cloudflare Pages
   nommé `ya-plouf` dans le compte ciblé.
4. Configurer Cloudflare Access devant les URLs Pages et Workers.
5. Ajouter les secrets suivants au dépôt GitHub :

   - `PREVIEW_DATABASE_URL`
   - `PREVIEW_HYPERDRIVE_ID`
   - `PREVIEW_SAFETY_SIGNING_KEY`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_WORKERS_SUBDOMAIN` : uniquement le sous-domaine Workers de
     votre compte, par exemple `mon-club`, sans `https://` ni `.workers.dev`

Le jeton Cloudflare doit seulement disposer des permissions nécessaires à
Workers, Pages et Hyperdrive. Aucun secret ne doit être disponible pour une PR
provenant d’un dépôt externe.

## Fonctionnement

Le workflow `.github/workflows/preview.yml` exécute les contrôles, crée le
schéma PostgreSQL, déploie l’API et le frontend, puis publie les URLs dans la
PR. Le provisionnement enregistre chaque fichier de migration dans la table
`schema_migration` du schéma concerné : un nouveau commit réutilise donc le
même schéma sans rejouer les migrations déjà appliquées. Un nouveau commit
réutilise le même schéma et met à jour les déploiements.

À la fermeture de la PR, le workflow supprime le schéma correspondant. Les
ressources Cloudflare sont nommées avec le numéro de PR afin de permettre une
suppression manuelle en cas d’échec du workflow.

## Limites connues

- La protection Cloudflare Access doit être configurée dans le tableau de bord
  ou par une automatisation Cloudflare séparée ; elle n’est pas désactivée par
  le workflow.
- Le plan gratuit Supabase ne fournit pas de sauvegardes automatiques et peut
  mettre en pause une base inactive.
- Les previews ne sont pas destinées à la production et ne doivent jamais
  recevoir de données personnelles ou de secrets de production.
