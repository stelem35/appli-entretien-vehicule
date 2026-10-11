// Synchronisation des rappels d'entretien vers le calendrier Google « Échéances »
// (format commun défini dans contrat-echeances-agenda.md). Connexion Google côté navigateur, jeton gardé en mémoire.
import { formatKm, vehiculeLabel, daysUntil } from './utils.js';

const CLIENT_ID = '145540817012-58tgrr7d2q357i9ejqu7gjg1imqkch9q.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/calendar';
const API = 'https://www.googleapis.com/calendar/v3';
const SOURCE = 'entretien';
const ALERT_DAYS = 28; // alerte 4 semaines avant (maximum accepté par Google)
const enc = encodeURIComponent;

const FLAG_KEY = 'entretien.gsync';
const LAST_KEY = 'entretien.gsync.last';

let token = null, expires = 0, client = null;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
};

export const hasToken = () => !!token && expires > Date.now() + 30000;
export const isEnabled = () => store.get(FLAG_KEY) === '1';
export const lastSync = () => store.get(LAST_KEY);

function whenGIS() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function check() {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - t0 > 10000) return reject(new Error('Google indisponible'));
      setTimeout(check, 100);
    })();
  });
}

// À appeler directement depuis un appui de l'utilisateur, sinon la fenêtre Google peut être bloquée.
export async function signIn() {
  await whenGIS();
  return new Promise((resolve, reject) => {
    client ||= google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: () => {} });
    client.callback = (r) => {
      if (r.error) return reject(new Error(r.error));
      token = r.access_token;
      expires = Date.now() + r.expires_in * 1000;
      store.set(FLAG_KEY, '1');
      resolve();
    };
    client.error_callback = (e) => reject(new Error(e.type || 'auth'));
    client.requestAccessToken({ prompt: '' });
  });
}

async function api(path, { method = 'GET', params = {}, body } = {}) {
  if (!hasToken()) throw new Error('Google Agenda non connecté');
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else if (v != null) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(json.error?.message || `Erreur Google (${res.status})`);
    e.status = res.status;
    throw e;
  }
  return json;
}

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Retrouve le calendrier « Échéances » ; le crée seulement si `create` est vrai
async function echeancesCalId(create) {
  const r = await api('/users/me/calendarList', { params: { minAccessRole: 'writer' } });
  const hit = (r.items || []).find((c) => norm(c.summaryOverride || c.summary).includes('echeance'));
  if (hit) return hit.id;
  if (!create) return null;
  const made = await api('/calendars', { method: 'POST', body: { summary: 'Échéances', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
  return made.id;
}

// Événements de l'app d'entretien dans le calendrier ; `rappelId` pour n'en cibler qu'un
async function findEvents(calId, rappelId) {
  const props = [`source=${SOURCE}`];
  if (rappelId) props.push(`sourceId=${rappelId}`);
  const items = [];
  let pageToken;
  do {
    const r = await api(`/calendars/${enc(calId)}/events`, { params: { privateExtendedProperty: props, maxResults: 250, pageToken } });
    items.push(...(r.items || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return items;
}

async function deleteEvent(calId, id) {
  try { await api(`/calendars/${enc(calId)}/events/${enc(id)}`, { method: 'DELETE' }); }
  catch (e) { if (e.status !== 404 && e.status !== 410) throw e; } // déjà supprimé
}

const addDay = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Un rappel est envoyé s'il a une date d'échéance non passée (un rappel au kilométrage seul n'a pas de date)
const isWanted = (r) => !!r.dateEcheance && daysUntil(r.dateEcheance) >= 0;

function eventBody(r, vehicule) {
  return {
    summary: `${r.typeEntretien} – ${vehiculeLabel(vehicule)}`,
    description: ['Rappel d\'entretien véhicule', r.kmEcheance != null ? `Kilométrage cible : ${formatKm(r.kmEcheance)}` : '', r.note || ''].filter(Boolean).join('\n'),
    start: { date: r.dateEcheance },
    end: { date: addDay(r.dateEcheance) },
    // Rappel à 9h, 4 semaines avant (pour une journée entière, Google compte depuis minuit du jour J)
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: ALERT_DAYS * 1440 - 540 }] },
    extendedProperties: { private: { source: SOURCE, sourceId: r.id, cat: 'admin' } },
  };
}

// Crée, met à jour ou supprime l'alerte d'un rappel. Retourne 'created' | 'updated' | 'removed' | 'skipped'.
export async function syncRappel(r, vehicule) {
  const wanted = isWanted(r);
  const calId = await echeancesCalId(wanted);
  if (!calId) return 'skipped';
  const found = await findEvents(calId, r.id);

  if (!wanted) {
    for (const ev of found) await deleteEvent(calId, ev.id);
    return found.length ? 'removed' : 'skipped';
  }
  const [first, ...extra] = found;
  for (const ev of extra) await deleteEvent(calId, ev.id); // doublons éventuels
  if (first) {
    await api(`/calendars/${enc(calId)}/events/${enc(first.id)}`, { method: 'PATCH', body: eventBody(r, vehicule) });
    return 'updated';
  }
  await api(`/calendars/${enc(calId)}/events`, { method: 'POST', body: eventBody(r, vehicule) });
  return 'created';
}

export async function removeRappel(rappelId) {
  const calId = await echeancesCalId(false);
  if (!calId) return;
  for (const ev of await findEvents(calId, rappelId)) await deleteEvent(calId, ev.id);
}

// Remet le calendrier en accord avec les rappels : crée/met à jour ceux qui ont une date, supprime les alertes orphelines
export async function syncAll(rappels, getVehicule) {
  const counts = { created: 0, updated: 0, removed: 0, skipped: 0 };
  for (const r of rappels) counts[await syncRappel(r, getVehicule(r.vehiculeId))]++;

  const calId = await echeancesCalId(false);
  if (calId) {
    const ids = new Set(rappels.map((r) => r.id));
    for (const ev of await findEvents(calId)) {
      if (!ids.has(ev.extendedProperties?.private?.sourceId)) { await deleteEvent(calId, ev.id); counts.removed++; }
    }
  }
  store.set(LAST_KEY, new Date().toISOString());
  return counts;
}
