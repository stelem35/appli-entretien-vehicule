import * as db from './db.js';
import { getVehicules, getVehiculeById } from './vehicules.js';
import {
  generateId, resizeImage, blobToObjectURL, showToast,
  vehiculeLabel, formatDate, formatCurrency, todayISO,
} from './utils.js';

let devis = [];
let mode = 'list';
let pendingPhotoBlob = null;
let removePhotoRequested = false;
let renderToken = 0;
let thumbUrls = [];
let debounceTimer = null;

const STATUT_LABELS = { attente: 'En attente', retenu: 'Retenu', ecarte: 'Écarté' };
const STATUT_CLASSES = { attente: 'status-soon', retenu: 'status-retenu', ecarte: 'status-ok' };

const listEl = document.getElementById('devis-list');
const emptyEl = document.getElementById('devis-empty');
const vehiculeFilter = document.getElementById('devis-vehicule-filter');
const statutFilter = document.getElementById('devis-statut-filter');
const texteFilter = document.getElementById('devis-texte-filter');
const sortSelect = document.getElementById('devis-sort');
const modeListBtn = document.getElementById('devis-mode-list');
const modeCompareBtn = document.getElementById('devis-mode-compare');
const compareHint = document.getElementById('devis-compare-hint');

const dialog = document.getElementById('dialog-devis');
const form = document.getElementById('form-devis');
const titleEl = document.getElementById('dialog-devis-title');
const errorEl = document.getElementById('devis-form-error');
const vehiculeSelect = document.getElementById('devis-vehicule');
const typeSelect = document.getElementById('devis-type');
const typeAutreField = document.getElementById('devis-type-autre-field');
const typeAutreInput = document.getElementById('devis-type-autre');
const photoCameraInput = document.getElementById('devis-photo-camera');
const photoGalleryInput = document.getElementById('devis-photo-gallery');
const photoPreview = document.getElementById('devis-photo-preview');
const photoRemoveBtn = document.getElementById('devis-photo-remove');

const photoDialog = document.getElementById('dialog-photo');
const photoFullImg = document.getElementById('photo-full');

export async function initDevis() {
  await reloadDevis();
  refreshVehiculeSelects();

  document.getElementById('fab').addEventListener('click', onFabClick);
  form.addEventListener('submit', handleSubmit);
  photoCameraInput.addEventListener('change', handlePhotoChange);
  photoGalleryInput.addEventListener('change', handlePhotoChange);
  photoRemoveBtn.addEventListener('click', handlePhotoRemove);
  dialog.addEventListener('close', resetForm);
  vehiculeFilter.addEventListener('change', render);
  statutFilter.addEventListener('change', render);
  sortSelect.addEventListener('change', render);
  texteFilter.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 200);
  });
  modeListBtn.addEventListener('click', () => setMode('list'));
  modeCompareBtn.addEventListener('click', () => setMode('compare'));
  typeSelect.addEventListener('change', () => {
    typeAutreField.hidden = typeSelect.value !== 'Autre';
  });
}

export async function reloadDevis() {
  devis = await db.getAll('devis');
  await render();
}

export function refreshVehiculeSelects() {
  const vehicules = getVehicules();
  const previousFilter = vehiculeFilter.value;

  vehiculeFilter.innerHTML = '<option value="">Tous les véhicules</option>' +
    vehicules.map((v) => `<option value="${v.id}">${escapeHtml(vehiculeLabel(v))}</option>`).join('');
  if (vehicules.some((v) => v.id === previousFilter)) vehiculeFilter.value = previousFilter;

  vehiculeSelect.innerHTML = vehicules.map((v) => `<option value="${v.id}">${escapeHtml(vehiculeLabel(v))}</option>`).join('');
  if (vehicules.length === 1) vehiculeSelect.value = vehicules[0].id;
}

function setMode(newMode) {
  mode = newMode;
  render();
}

function statutOf(d) {
  return STATUT_LABELS[d.statut] ? d.statut : 'attente';
}

function hasActiveFilters() {
  return !!(vehiculeFilter.value || statutFilter.value || texteFilter.value.trim());
}

function getFiltered() {
  let list = devis.slice();
  if (vehiculeFilter.value) list = list.filter((d) => d.vehiculeId === vehiculeFilter.value);
  if (statutFilter.value) list = list.filter((d) => statutOf(d) === statutFilter.value);

  const texte = texteFilter.value.trim().toLowerCase();
  if (texte) {
    list = list.filter((d) =>
      (d.resume || '').toLowerCase().includes(texte)
      || (d.nomGarage || '').toLowerCase().includes(texte)
      || (d.typeEntretien || '').toLowerCase().includes(texte)
      || (d.note || '').toLowerCase().includes(texte)
    );
  }

  const [field, dir] = sortSelect.value.split('-');
  const key = field === 'date' ? 'dateDevis' : 'prix';
  list.sort((a, b) => {
    const cmp = key === 'prix' ? a.prix - b.prix : String(a.dateDevis).localeCompare(String(b.dateDevis));
    return dir === 'asc' ? cmp : -cmp;
  });
  return list;
}

async function render() {
  const token = ++renderToken;
  const list = getFiltered();
  const urls = [];
  const fragment = document.createDocumentFragment();

  if (mode === 'list') {
    for (const d of list) fragment.appendChild(await buildCard(d, null, urls));
  } else {
    const groups = new Map();
    for (const d of list) {
      const key = d.vehiculeId + '|' + d.typeEntretien;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }
    const latest = (g) => g.reduce((max, d) => (d.dateDevis > max ? d.dateDevis : max), '');
    const ordered = [...groups.values()].sort((a, b) => latest(b).localeCompare(latest(a)));

    for (const g of ordered) {
      g.sort((a, b) => a.prix - b.prix || String(b.dateDevis).localeCompare(String(a.dateDevis)));
      const min = g[0].prix;
      const hasSpread = g.some((d) => d.prix > min);

      const section = document.createElement('section');
      section.className = 'devis-group';
      const v = getVehiculeById(g[0].vehiculeId);
      section.innerHTML = `
        <h3 class="devis-group-title">${escapeHtml(g[0].typeEntretien)}</h3>
        <div class="devis-group-sub">${escapeHtml(vehiculeLabel(v))} · ${g.length} devis</div>
      `;
      const inner = document.createElement('div');
      inner.className = 'list';
      for (const d of g) {
        const compare = g.length > 1 && hasSpread
          ? { best: d.prix === min, delta: d.prix - min, pct: min > 0 ? Math.round(((d.prix - min) / min) * 100) : null }
          : null;
        inner.appendChild(await buildCard(d, compare, urls));
      }
      section.appendChild(inner);
      fragment.appendChild(section);
    }
  }

  if (token !== renderToken) {
    urls.forEach((u) => URL.revokeObjectURL(u));
    return;
  }

  thumbUrls.forEach((u) => URL.revokeObjectURL(u));
  thumbUrls = urls;
  listEl.replaceChildren(fragment);

  emptyEl.hidden = list.length > 0;
  emptyEl.textContent = hasActiveFilters()
    ? 'Aucun devis ne correspond à ces filtres.'
    : 'Aucun devis pour l\'instant. Ajoutes-en un avec le bouton "+".';
  compareHint.hidden = mode !== 'compare';
  sortSelect.hidden = mode === 'compare';
  modeListBtn.classList.toggle('active', mode === 'list');
  modeCompareBtn.classList.toggle('active', mode === 'compare');
}

async function buildCard(d, compare, urls) {
  const v = getVehiculeById(d.vehiculeId);
  const statut = statutOf(d);
  const card = document.createElement('div');
  card.className = 'card' + (statut === 'ecarte' ? ' card-dim' : '');

  let thumbHtml = `<div class="card-thumb-placeholder">🧾</div>`;
  if (d.photoBlobId) {
    const blob = await db.getBlob(d.photoBlobId);
    if (blob) {
      const url = blobToObjectURL(blob);
      urls.push(url);
      thumbHtml = `<img class="card-thumb" src="${url}" alt="" data-action="photo">`;
    }
  }

  const badges = [];
  if (compare) {
    if (compare.best) {
      badges.push('<span class="status-badge status-best">Le moins cher</span>');
    } else {
      const pct = compare.pct != null ? ` (+${compare.pct} %)` : '';
      badges.push(`<span class="status-badge status-ok">+${formatCurrency(compare.delta)}${pct}</span>`);
    }
  }
  badges.push(`<span class="status-badge ${STATUT_CLASSES[statut]}">${STATUT_LABELS[statut]}</span>`);

  const title = mode === 'compare'
    ? escapeHtml(d.nomGarage || '—')
    : `${escapeHtml(d.typeEntretien)} — ${escapeHtml(d.resume || '')}`;
  const subtitle = mode === 'compare'
    ? escapeHtml(d.resume || '')
    : `${escapeHtml(vehiculeLabel(v))} · ${escapeHtml(d.nomGarage || '')}`;

  card.innerHTML = `
    ${thumbHtml}
    <div class="card-body">
      <div class="card-title">${title}</div>
      <div class="card-subtitle">${subtitle}</div>
      <div class="card-meta">
        <span>${formatDate(d.dateDevis)}</span>
        ${d.note ? `<span>${escapeHtml(d.note)}</span>` : ''}
      </div>
      <div class="card-badges">${badges.join('')}</div>
    </div>
    <div class="card-actions">
      <span class="card-price">${formatCurrency(d.prix)}</span>
      <button type="button" class="icon-btn" data-action="edit" title="Modifier">✏️</button>
      <button type="button" class="icon-btn" data-action="delete" title="Supprimer">🗑️</button>
    </div>
  `;

  const thumbEl = card.querySelector('[data-action="photo"]');
  if (thumbEl) thumbEl.addEventListener('click', () => {
    photoFullImg.src = thumbEl.src;
    photoDialog.showModal();
  });
  card.querySelector('[data-action="edit"]').addEventListener('click', () => openForm(d.id));
  card.querySelector('[data-action="delete"]').addEventListener('click', () => confirmDelete(d.id));
  return card;
}

function onFabClick() {
  const activeView = document.querySelector('.view:not([hidden])');
  if (activeView && activeView.id === 'view-devis') {
    if (getVehicules().length === 0) {
      showToast('Ajoute d\'abord un véhicule');
      return;
    }
    openForm(null);
  }
}

function openForm(id) {
  pendingPhotoBlob = null;
  removePhotoRequested = false;
  errorEl.hidden = true;
  refreshVehiculeSelects();

  if (id) {
    const d = devis.find((x) => x.id === id);
    titleEl.textContent = 'Modifier le devis';
    document.getElementById('devis-id').value = d.id;
    vehiculeSelect.value = d.vehiculeId;
    document.getElementById('devis-date').value = d.dateDevis;

    const knownTypes = Array.from(typeSelect.options).map((o) => o.value).filter((v) => v !== 'Autre');
    if (knownTypes.includes(d.typeEntretien)) {
      typeSelect.value = d.typeEntretien;
      typeAutreField.hidden = true;
      typeAutreInput.value = '';
    } else {
      typeSelect.value = 'Autre';
      typeAutreField.hidden = false;
      typeAutreInput.value = d.typeEntretien;
    }

    document.getElementById('devis-resume').value = d.resume || '';
    document.getElementById('devis-prix').value = d.prix;
    document.getElementById('devis-statut').value = statutOf(d);
    document.getElementById('devis-garage').value = d.nomGarage || '';
    document.getElementById('devis-note').value = d.note || '';

    if (d.photoBlobId) {
      db.getBlob(d.photoBlobId).then((blob) => {
        if (blob) {
          photoPreview.src = blobToObjectURL(blob);
          photoPreview.hidden = false;
          photoRemoveBtn.hidden = false;
        }
      });
    } else {
      photoPreview.hidden = true;
      photoRemoveBtn.hidden = true;
    }
  } else {
    titleEl.textContent = 'Nouveau devis';
    form.reset();
    document.getElementById('devis-id').value = '';
    document.getElementById('devis-date').value = todayISO();
    typeAutreField.hidden = true;
    photoPreview.hidden = true;
    photoRemoveBtn.hidden = true;
    if (getVehicules().length === 1) vehiculeSelect.value = getVehicules()[0].id;
  }

  dialog.showModal();
}

async function handlePhotoChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    pendingPhotoBlob = await resizeImage(file);
    removePhotoRequested = false;
    photoPreview.src = blobToObjectURL(pendingPhotoBlob);
    photoPreview.hidden = false;
    photoRemoveBtn.hidden = false;
  } catch (err) {
    errorEl.textContent = 'Impossible de charger cette photo.';
    errorEl.hidden = false;
  }
}

function handlePhotoRemove() {
  pendingPhotoBlob = null;
  removePhotoRequested = true;
  photoCameraInput.value = '';
  photoGalleryInput.value = '';
  photoPreview.hidden = true;
  photoPreview.src = '';
  photoRemoveBtn.hidden = true;
}

async function handleSubmit(e) {
  e.preventDefault();
  errorEl.hidden = true;

  const id = document.getElementById('devis-id').value || generateId();
  const isNew = !document.getElementById('devis-id').value;
  const typeValue = typeSelect.value === 'Autre' ? typeAutreInput.value.trim() : typeSelect.value;

  const d = {
    id,
    vehiculeId: vehiculeSelect.value,
    dateDevis: document.getElementById('devis-date').value,
    typeEntretien: typeValue,
    resume: document.getElementById('devis-resume').value.trim(),
    prix: Number(document.getElementById('devis-prix').value),
    statut: document.getElementById('devis-statut').value,
    nomGarage: document.getElementById('devis-garage').value.trim(),
    note: document.getElementById('devis-note').value.trim(),
    photoBlobId: null,
    dateCreation: new Date().toISOString(),
  };

  if (!d.vehiculeId || !d.dateDevis || !typeValue || !d.resume || !d.nomGarage) {
    errorEl.textContent = 'Merci de remplir tous les champs obligatoires.';
    errorEl.hidden = false;
    return;
  }

  const existing = isNew ? null : devis.find((x) => x.id === id);
  d.dateCreation = existing ? existing.dateCreation : d.dateCreation;
  d.photoBlobId = existing ? existing.photoBlobId : null;

  if (pendingPhotoBlob) {
    const blobId = d.photoBlobId || generateId();
    await db.saveBlob(blobId, pendingPhotoBlob);
    d.photoBlobId = blobId;
  } else if (removePhotoRequested && d.photoBlobId) {
    await db.deleteBlob(d.photoBlobId);
    d.photoBlobId = null;
  }

  await db.put('devis', d);
  dialog.close();
  showToast(isNew ? 'Devis ajouté' : 'Devis modifié');
  await reloadDevis();
}

function resetForm() {
  form.reset();
  pendingPhotoBlob = null;
  removePhotoRequested = false;
  photoPreview.hidden = true;
  photoPreview.src = '';
  photoRemoveBtn.hidden = true;
  errorEl.hidden = true;
  typeAutreField.hidden = true;
}

function confirmDelete(id) {
  const d = devis.find((x) => x.id === id);
  const confirmDialog = document.getElementById('dialog-confirm');
  document.getElementById('confirm-title').textContent = 'Supprimer ce devis ?';
  document.getElementById('confirm-message').textContent = `Devis ${d.nomGarage} (${d.typeEntretien}, ${formatCurrency(d.prix)}) — action irréversible.`;

  const okBtn = document.getElementById('confirm-ok');
  const handler = async () => {
    confirmDialog.close();
    if (d.photoBlobId) await db.deleteBlob(d.photoBlobId);
    await db.remove('devis', id);
    showToast('Devis supprimé');
    await reloadDevis();
  };
  okBtn.addEventListener('click', handler);
  // Retire l'écouteur à la fermeture, y compris sur « Annuler », pour ne pas supprimer deux fois.
  confirmDialog.addEventListener('close', () => okBtn.removeEventListener('click', handler), { once: true });
  confirmDialog.showModal();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
