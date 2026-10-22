# VC Liévin · Régionale 1 Masculins

Le site de l'équipe **Liévin 2** (Régionale 1 Masculins Hauts-de-France, poule A), alimenté par le
[calendrier officiel FFVB](https://www.ffvbbeach.org/ffvbapp/resu/vbspo_calendrier.php?saison=2026/2027&codent=LIFL&poule=1MA)
et mis à jour automatiquement plusieurs fois par jour.

## Ce que propose le site

- **Accueil** : prochain match avec compte à rebours, salle, itinéraire (Google Maps, Waze), heure de départ conseillée,
  arbitrage, dernier résultat set par set, position au classement, fiche de l'adversaire, journée en cours,
  arbitrages confiés au club.
- **Calendrier** : les 18 matchs (filtres domicile / extérieur / à venir / joués), détail de chaque rencontre,
  feuille de match officielle, ajout à l'agenda, et toute la poule journée par journée.
- **Abonnement agenda** : `calendar/lievin-2.ics` se met à jour tout seul dans le téléphone des joueurs et supporters
  (changement d'horaire, report, score).
- **Classement** : tableau complet, forme sur 5 matchs, évolution des places semaine par semaine,
  simulateur « Et si… ? ».
- **Adversaires** : rose des déplacements, kilométrage de la saison, fiche de chaque équipe (salles, résultats,
  confrontations).
- **Stats** : sets, tie-breaks, sets serrés, domicile / extérieur, écart de points set par set, attaque et défense
  comparées, records.
- **Affiches** prêtes pour Instagram / Facebook (prochain match et résultat), installable sur l'écran d'accueil
  du téléphone, thème clair et sombre.

## Application iPhone et Android

Le site est une **application web installable** : une seule app pour iPhone et Android, sans App Store ni Play Store,
sans compte, gratuite et toujours à jour.

- Page **Application** (`#app`, bouton téléphone en haut) : étapes d'installation adaptées à l'appareil détecté
  (iPhone, Android, ordinateur), alerte si le lien est ouvert dans Instagram / Facebook / Messenger,
  bouton d'installation en un geste sur Android et ordinateur.
- **QR code** à montrer à l'entraînement et **affiche à imprimer** pour le gymnase : le code ouvre directement la page
  d'installation.
- Une fois installée : plein écran, fonctionne hors connexion, raccourcis (appui long sur l'icône Android),
  données rechargées à chaque retour dans l'app, pastille sur l'icône quand un résultat arrive.

## Notifications

Le dossier `push/` contient un petit service Cloudflare Workers (gratuit) :

- l'app installée s'y abonne (`/subscribe`) avec les sujets choisis : rappels de match (veille 18h et 3 h avant,
  avec l'heure de départ), résultats, changements d'horaire ou de salle, arbitrages du club ;
- toutes les 15 minutes, il relit `data/data.json` du site, détecte ce qui est nouveau et envoie les notifications
  (Web Push chiffré, compatible iPhone iOS 16.4+ et Android) ;
- `npm test` dans `push/` vérifie le chiffrement avec l'implémentation de référence et la détection des événements.

Mise en service (une fois) :

```bash
cd push && npm install
npx wrangler login
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler deploy
```

Puis renseigner l'adresse du service dans `site.config.json` (`pushApi`). La clé publique (`vapidPublicKey`)
y est déjà ; la clé privée ne doit jamais être publiée.

## Comment marche la mise à jour

`scripts/update.mjs` (Node 20+, sans dépendance) :

1. lit la page FFVB de la poule (classement + 90 matchs) ;
2. lit quelques fiches de match PDF pour récupérer l'adresse des salles et les couleurs des clubs ;
3. géolocalise les salles (API Adresse du gouvernement) et calcule le trajet depuis la salle de Liévin (OSRM) ;
4. écrit `data/data.json` et les calendriers `calendar/*.ics`.

Le workflow GitHub `.github/workflows/mise-a-jour.yml` le lance chaque matin, le samedi et le dimanche soir,
enregistre les données et republie le site sur GitHub Pages. Si la FFVB est injoignable, le site garde les données
de la veille (la pastille « Mis à jour » passe à l'orange au-delà de 36 h).

Pour forcer une mise à jour : onglet **Actions** du dépôt → « Mise à jour FFVB » → **Run workflow**.

## Réglages (`site.config.json`)

| Clé | Rôle |
| --- | --- |
| `season`, `codent`, `poule` | la poule FFVB suivie (à changer à chaque nouvelle saison) |
| `team` | le nom exact de l'équipe sur le site FFVB (`LIEVIN 2`) |
| `siteUrl` | l'adresse publique du site (utilisée dans les partages et les agendas) |
| `arrivalBufferMinutes` | arrivée conseillée avant le coup d'envoi (60 par défaut) |
| `matchDurationMinutes` | durée d'un match dans les agendas |
| `zones.promotion`, `zones.relegation` | nombre de places montantes / descendantes à colorer dans le classement (0 = rien) |
| `displayNames`, `shortNames` | orthographe et abréviation des équipes |

## En local

```bash
node scripts/update.mjs
npx --yes http-server@14.1.1 -p 8080 -c-1 .
```

Puis ouvrir http://localhost:8080.
