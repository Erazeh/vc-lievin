// Quand relancer la mise à jour du site. GitHub retarde ses tâches programmées de plusieurs heures :
// c'est donc ce service, ponctuel, qui déclenche la mise à jour au bon moment.
import { kickoff } from '../../assets/lib.js';

const MIN = 60e3;
const HOUR = 60 * MIN;

function parisClock(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(now)).map(x => [x.type, x.value]));
  return { h: +p.hour, m: +p.minute };
}

/**
 * Renvoie 'full' (tout : salles, couleurs, trajets), 'quick' (calendrier et classement seulement) ou null.
 * last = { at } : dernière mise à jour déclenchée.
 */
export function updateDue(data, now, last) {
  const since = now - (last?.at || 0);
  if (since < 25 * MIN) return null; // une mise à jour est déjà en route
  const { h, m } = parisClock(now);
  // Chaque matin vers 6h30 : mise à jour complète.
  if (h === 6 && m >= 30 && m < 45) return 'full';
  // Après chaque match de la poule : toutes les 30 min jusqu'au résultat (Liévin dès 1 h 30, les autres dès 2 h).
  const T = data.config.team;
  for (const match of data.matches) {
    if (match.played) continue;
    const ko = kickoff(match).getTime();
    const ours = match.home === T || match.away === T;
    if (now >= ko + (ours ? 90 : 120) * MIN && now <= ko + 10 * HOUR) return 'quick';
  }
  // Filet de sécurité : jamais plus de 8 h sans mise à jour entre 8h et 23h.
  if (since > 8 * HOUR && h >= 8 && h <= 23) return 'quick';
  return null;
}

/** Lance le workflow GitHub. Renvoie le code HTTP (204 = lancé). */
export async function dispatch(env, mode) {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'vc-lievin-push',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ref: 'main', inputs: { mode } })
  });
  return res.status;
}
