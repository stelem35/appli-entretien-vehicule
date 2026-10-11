import * as db from './db.js';
import { getVehicules, getVehiculeById } from './vehicules.js';
import { getEntretiens } from './entretiens.js';
import { generateId, showToast, vehiculeLabel, formatDate, formatKm, daysUntil, addDaysISO } from './utils.js';
import * as gcal from './gcal.js';

const SOON_DAYS = 30;
const SOON_KM = 1000;

let rappels = [];
let onChangeCallback = null;

const listEl = document.getElementById('rappels-list');
const emptyEl = document.getElementById('rappels-empty');
const suggestionsSection = document.getElementById('rappels-suggestions-section');
const suggestionsList = document.getElementById('rappels-suggestions-list');

const dialog = document.getElementById('dialog-rappel');
const form = document.getElementById('form-rappel');
const titleEl = document.getElementById('dialog-rappel-title');
const errorEl = document.getElementById('rappel-form-error');
const vehiculeSelect = document.getElementById('rappel-vehicule');
const typeSelect = document.getElementById('rappel-type');
const typeAutreField = document.getElementById('rappel-type-autre-field');
const typeAutreInput = document.getElementById('rappel-type-autre');
const dateInput = document.getElementById('rappel-date');
const kmInput = document.getElementById('rappel-km');
const noteInput = document.getElementById('rappel-note');

const banner = document.getElementById('rappels-banner');

export function getRappels() {
  return rappels;
}

export async function initRappels(onChange) {
  onChangeCallback = onChange;
  await refresh();
  refreshVehiculeSelects();

  document.getElementById('fab').addEventListener('click', onFabClick);
  form.addEventListener('submit', handleSubmit);
  dialog.addEventListener('close', resetForm);
  typeSelect.addEventListener('change', () => {
    typeAutreField.hidden = typeSelect.value !== 'Autre';
  });
  banner.addEventListener('click', () => {
    document.querySelector('.nav-btn[data-view="rappels"]').click();
  });
  document.getElementById('gsync-btn').addEventListener('click', handleSyncAll);
  renderGsync();
}

// --- Synchronisation vers Google Agenda (calendrier « Échéances ») ---

function renderGsync() {
  const last = gcal.lastSync();
  const when = last ? new Date(last).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  document.getElementById('gsync-status').textContent = gcal.isEnabled()
    ? `Actif · ${when ? 'dernière synchro le ' + when : 'pas encore synchronisé'}`
    : 'Envoie les rappels datés dans le calendrier « Échéances »';
}

async function handleSyncAll() {
  const btn = document.getElementById('gsync-btn');
  btn.disabled = true;
  try {
    if (!gcal.hasToken()) await gcal.signIn();
    const c = await gcal.syncAll(rappels, getVehiculeById);
    showToast(`Synchronisé : ${c.created} créé(s), ${c.updated} mis à jour, ${c.removed} supprimé(s)`, 3500);
  } catch (err) {
    showToast(`Synchronisation impossible : ${err.message}`, 3500);
  }
  btn.disabled = false;
  renderGsync();
}

export function refreshVehiculeSelects() {
  const vehicules = getVehicules();
  vehiculeSelect.innerHTML = vehicules.map((v) => `<option value="${v.id}">${escapeHtml(vehiculeLabel(v))}</option>`).join('');
  if (vehicules.length === 1) vehiculeSelect.value = vehicules[0].id;
}

async function refresh() {
  rappels = await db.getAll('rappels');
  await render();
  renderBanner();
  renderSuggestions();
  if (onChangeCallback) onChangeCallback();
}

export async function onDataChanged() {
  await render();
  renderBanner();
  renderSuggestions();
}

// Estimation du kilométrage actuel : kilométrage du dernier entretien enregistré (par date).
function currentKmFor(vehiculeId) {
  const list = getEntretiens().filter((e) => e.vehiculeId === vehiculeId);
  if (list.length === 0) return null;
  const latest = list.reduce((a, b) => (b.dateEntretien > a.dateEntretien ? b : a));
  return Number(latest.kilometrage) || null;
}

function computeStatus(rappel) {
  const jours = daysUntil(rappel.dateEcheance);
  const kmActuel = rappel.kmEcheance != null ? currentKmFor(rappel.vehiculeId) : null;
  const kmRestant = rappel.kmEcheance != null && kmActuel != null ? rappel.kmEcheance - kmActuel : null;

  const overdue = (jours !== null && jours < 0) || (kmRestant !== null && kmRestant <= 0);
  const soon = !overdue && ((jours !== null && jours <= SOON_DAYS) || (kmRestant !== null && kmRestant <= SOON_KM));

  let level = 'ok';
  if (overdue) level = 'overdue';
  else if (soon) level = 'soon';

  return { level, jours, kmActuel, kmRestant };
}

function sortRappels(list) {
  const rank = { overdue: 0, soon: 1, ok: 2 };
  return list
    .map((r) => ({ r, status: computeStatus(r) }))
    .sort((a, b) => {
      const rankDiff = rank[a.status.level] - rank[b.status.level];
      if (rankDiff !== 0) return rankDiff;
      const aKey = a.status.jours ?? a.status.kmRestant ?? Infinity;
      const bKey = b.status.jours ?? b.status.kmRestant ?? Infinity;
      return aKey - bKey;
    });
}

function renderBanner() {
  const actifs = rappels.map(computeStatus).filter((s) => s.level !== 'ok');
  const overdueCount = actifs.filter((s) => s.level === 'overdue').length;

  if (actifs.length === 0) {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
  banner.classList.toggle('rappels-banner-danger', overdueCount > 0);
  banner.textContent = overdueCount > 0
    ? `⚠️ ${overdueCount} rappel(s) en retard, ${actifs.length} au total`
    : `🔔 ${actifs.length} rappel(s) à surveiller`;
}

async function render() {
  const sorted = sortRappels(rappels);
  listEl.innerHTML = '';
  emptyEl.hidden = sorted.length > 0;

  const STATUS_LABELS = { overdue: 'En retard', soon: 'Bientôt', ok: 'À venir' };

  for (const { r, status } of sorted) {
    const v = getVehiculeById(r.vehiculeId);
    const card = document.createElement('div');
    card.className = 'card';

    const metaParts = [];
    if (r.dateEcheance) metaParts.push(`<span>${formatDate(r.dateEcheance)}</span>`);
    if (r.kmEcheance != null) {
      metaParts.push(`<span>${formatKm(r.kmEcheance)}${status.kmActuel != null ? ` (actuel ~${formatKm(status.kmActuel)})` : ''}</span>`);
    }

    card.innerHTML = `
      <div class="card-thumb-placeholder">🔔</div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(r.typeEntretien)}</div>
        <div class="card-subtitle">${vehiculeLabel(v)}${r.note ? ' · ' + escapeHtml(r.note) : ''}</div>
        <div class="card-meta">${metaParts.join('')}</div>
      </div>
      <div class="card-actions">
        <span class="status-badge status-${status.level}">${STATUS_LABELS[status.level]}</span>
        <button type="button" class="icon-btn" data-action="edit" title="Modifier">✏️</button>
        <button type="button" class="icon-btn" data-action="delete" title="Supprimer">🗑️</button>
      </div>
    `;

    card.querySelector('[data-action="edit"]').addEventListener('click', () => openForm(r.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => confirmDelete(r.id));

    listEl.appendChild(card);
  }
}

// Calcule, pour chaque couple véhicule/type ayant au moins 2 entretiens du
// même type, l'intervalle moyen réel (jours et km) et en déduit une prochaine
// échéance suggérée. Rien n'est inventé : sans historique suffisant, pas de suggestion.
function computeSuggestions() {
  const existingKeys = new Set(rappels.map((r) => r.vehiculeId + '|' + r.typeEntretien));
  const groups = new Map();
  for (const e of getEntretiens()) {
    const key = e.vehiculeId + '|' + e.typeEntretien;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const suggestions = [];
  for (const [key, list] of groups) {
    if (list.length < 2 || existingKeys.has(key)) continue;
    list.sort((a, b) => a.dateEntretien.localeCompare(b.dateEntretien));

    let daySum = 0, dayCount = 0, kmSum = 0, kmCount = 0;
    for (let i = 1; i < list.length; i++) {
      const d1 = new Date(list[i - 1].dateEntretien + 'T00:00:00');
      const d2 = new Date(list[i].dateEntretien + 'T00:00:00');
      const diffDays = Math.round((d2 - d1) / 86400000);
      if (diffDays > 0) { daySum += diffDays; dayCount++; }

      const km1 = Number(list[i - 1].kilometrage) || 0;
      const km2 = Number(list[i].kilometrage) || 0;
      const diffKm = km2 - km1;
      if (diffKm > 0) { kmSum += diffKm; kmCount++; }
    }
    if (dayCount === 0 && kmCount === 0) continue;

    const last = list[list.length - 1];
    const avgDays = dayCount > 0 ? Math.round(daySum / dayCount) : null;
    const avgKm = kmCount > 0 ? Math.round(kmSum / kmCount) : null;

    suggestions.push({
      vehiculeId: last.vehiculeId,
      typeEntretien: last.typeEntretien,
      suggestedDate: avgDays != null ? addDaysISO(last.dateEntretien, avgDays) : '',
      suggestedKm: avgKm != null ? (Number(last.kilometrage) || 0) + avgKm : null,
      avgDays,
      avgKm,
      basedOn: list.length,
    });
  }

  return suggestions.sort((a, b) => (a.suggestedDate || '9999').localeCompare(b.suggestedDate || '9999'));
}

function renderSuggestions() {
  const suggestions = computeSuggestions();
  suggestionsSection.hidden = suggestions.length === 0;
  suggestionsList.innerHTML = '';

  for (const s of suggestions) {
    const v = getVehiculeById(s.vehiculeId);
    const card = document.createElement('div');
    card.className = 'card';

    const metaParts = [];
    if (s.suggestedDate) metaParts.push(`<span>${formatDate(s.suggestedDate)} (~${Math.round(s.avgDays / 30)} mois)</span>`);
    if (s.suggestedKm != null) metaParts.push(`<span>~${formatKm(s.suggestedKm)} (~${formatKm(s.avgKm)})</span>`);

    card.innerHTML = `
      <div class="card-thumb-placeholder">💡</div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(s.typeEntretien)}</div>
        <div class="card-subtitle">${vehiculeLabel(v)} · basé sur ${s.basedOn} entretiens</div>
        <div class="card-meta">${metaParts.join('')}</div>
      </div>
      <div class="card-actions">
        <button type="button" class="btn btn-ghost btn-small" data-action="create">Créer</button>
      </div>
    `;

    card.querySelector('[data-action="create"]').addEventListener('click', () => openFormFromSuggestion(s));
    suggestionsList.appendChild(card);
  }
}

function openFormFromSuggestion(s) {
  errorEl.hidden = true;
  refreshVehiculeSelects();

  titleEl.textContent = 'Nouveau rappel';
  form.reset();
  document.getElementById('rappel-id').value = '';
  vehiculeSelect.value = s.vehiculeId;

  const knownTypes = Array.from(typeSelect.options).map((o) => o.value).filter((v) => v !== 'Autre');
  if (knownTypes.includes(s.typeEntretien)) {
    typeSelect.value = s.typeEntretien;
    typeAutreField.hidden = true;
  } else {
    typeSelect.value = 'Autre';
    typeAutreField.hidden = false;
    typeAutreInput.value = s.typeEntretien;
  }

  dateInput.value = s.suggestedDate || '';
  kmInput.value = s.suggestedKm != null ? s.suggestedKm : '';
  noteInput.value = `Suggéré d'après l'historique (intervalle moyen sur ${s.basedOn} entretiens)`;

  dialog.showModal();
}

function onFabClick() {
  const activeView = document.querySelector('.view:not([hidden])');
  if (activeView && activeView.id === 'view-rappels') {
    if (getVehicules().length === 0) {
      showToast('Ajoutez d\'abord un véhicule');
      return;
    }
    openForm(null);
  }
}

function openForm(id) {
  errorEl.hidden = true;
  refreshVehiculeSelects();

  if (id) {
    const r = rappels.find((x) => x.id === id);
    titleEl.textContent = 'Modifier le rappel';
    document.getElementById('rappel-id').value = r.id;
    vehiculeSelect.value = r.vehiculeId;

    const knownTypes = Array.from(typeSelect.options).map((o) => o.value).filter((v) => v !== 'Autre');
    if (knownTypes.includes(r.typeEntretien)) {
      typeSelect.value = r.typeEntretien;
      typeAutreField.hidden = true;
      typeAutreInput.value = '';
    } else {
      typeSelect.value = 'Autre';
      typeAutreField.hidden = false;
      typeAutreInput.value = r.typeEntretien;
    }

    dateInput.value = r.dateEcheance || '';
    kmInput.value = r.kmEcheance ?? '';
    noteInput.value = r.note || '';
  } else {
    titleEl.textContent = 'Nouveau rappel';
    form.reset();
    document.getElementById('rappel-id').value = '';
    typeAutreField.hidden = true;
    if (getVehicules().length === 1) vehiculeSelect.value = getVehicules()[0].id;
  }

  dialog.showModal();
}

async function handleSubmit(e) {
  e.preventDefault();
  errorEl.hidden = true;

  const id = document.getElementById('rappel-id').value || generateId();
  const isNew = !document.getElementById('rappel-id').value;
  const typeValue = typeSelect.value === 'Autre' ? typeAutreInput.value.trim() : typeSelect.value;

  const rappel = {
    id,
    vehiculeId: vehiculeSelect.value,
    typeEntretien: typeValue,
    dateEcheance: dateInput.value || '',
    kmEcheance: kmInput.value !== '' ? Number(kmInput.value) : null,
    note: noteInput.value.trim(),
    dateCreation: new Date().toISOString(),
  };

  if (!rappel.vehiculeId || !typeValue) {
    errorEl.textContent = 'Merci de remplir tous les champs obligatoires.';
    errorEl.hidden = false;
    return;
  }
  if (!rappel.dateEcheance && rappel.kmEcheance == null) {
    errorEl.textContent = 'Indiquez une date et/ou un kilométrage cible.';
    errorEl.hidden = false;
    return;
  }

  const existing = isNew ? null : rappels.find((r) => r.id === id);
  rappel.dateCreation = existing ? existing.dateCreation : rappel.dateCreation;

  // Synchro Google : concerne les rappels datés (ou ceux qui l'étaient, pour retirer l'alerte).
  // La fenêtre Google doit s'ouvrir directement sur l'appui, donc avant toute autre opération asynchrone.
  const wantSync = gcal.isEnabled() && !!(rappel.dateEcheance || existing?.dateEcheance);
  let googleOk = true;
  if (wantSync && !gcal.hasToken()) {
    try { await gcal.signIn(); } catch { googleOk = false; }
  }

  await db.put('rappels', rappel);

  let syncNote = '';
  if (wantSync) {
    if (!googleOk) syncNote = ' (alerte Google non synchronisée)';
    else {
      try { await gcal.syncRappel(rappel, getVehiculeById(rappel.vehiculeId)); }
      catch { syncNote = ' (alerte Google non synchronisée)'; }
    }
  }

  dialog.close();
  showToast((isNew ? 'Rappel ajouté' : 'Rappel modifié') + syncNote, syncNote ? 3500 : 2200);
  await refresh();
}

function resetForm() {
  form.reset();
  errorEl.hidden = true;
  typeAutreField.hidden = true;
}

async function confirmDelete(id) {
  const r = rappels.find((x) => x.id === id);
  const confirmDialog = document.getElementById('dialog-confirm');
  document.getElementById('confirm-title').textContent = 'Supprimer ce rappel ?';
  document.getElementById('confirm-message').textContent = `Rappel "${r.typeEntretien}" — action irréversible.`;

  const okBtn = document.getElementById('confirm-ok');
  const handler = async () => {
    okBtn.removeEventListener('click', handler);
    confirmDialog.close();
    const wantSync = gcal.isEnabled() && !!r.dateEcheance;
    let googleOk = true;
    if (wantSync && !gcal.hasToken()) {
      try { await gcal.signIn(); } catch { googleOk = false; }
    }
    await db.remove('rappels', id);
    let msg = 'Rappel supprimé';
    if (wantSync) {
      if (!googleOk) msg += ' (alerte Google à supprimer à la main)';
      else {
        try { await gcal.removeRappel(id); }
        catch { msg += ' (alerte Google non supprimée)'; }
      }
    }
    showToast(msg, msg.length > 20 ? 3500 : 2200);
    await refresh();
  };
  okBtn.addEventListener('click', handler);
  confirmDialog.showModal();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
