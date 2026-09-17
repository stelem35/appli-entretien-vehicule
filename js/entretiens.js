import * as db from './db.js';
import { getVehicules, getVehiculeById } from './vehicules.js';
import {
  generateId, resizeImage, blobToObjectURL, showToast,
  vehiculeLabel, formatDate, formatCurrency, formatKm, todayISO,
} from './utils.js';

let entretiens = [];
let pendingPhotoBlob = null;
let onChangeCallback = null;

const listEl = document.getElementById('entretiens-list');
const emptyEl = document.getElementById('entretiens-empty');
const vehiculeFilter = document.getElementById('entretien-vehicule-filter');
const sortSelect = document.getElementById('entretien-sort');

const dialog = document.getElementById('dialog-entretien');
const form = document.getElementById('form-entretien');
const titleEl = document.getElementById('dialog-entretien-title');
const errorEl = document.getElementById('entretien-form-error');
const photoInput = document.getElementById('entretien-photo');
const photoPreview = document.getElementById('entretien-photo-preview');
const vehiculeSelect = document.getElementById('entretien-vehicule');
const typeSelect = document.getElementById('entretien-type');
const typeAutreField = document.getElementById('entretien-type-autre-field');
const typeAutreInput = document.getElementById('entretien-type-autre');

const photoDialog = document.getElementById('dialog-photo');
const photoFullImg = document.getElementById('photo-full');

export function getEntretiens() {
  return entretiens;
}

export async function initEntretiens(onChange) {
  onChangeCallback = onChange;
  await refresh();
  refreshVehiculeSelects();

  document.getElementById('fab').addEventListener('click', onFabClick);
  form.addEventListener('submit', handleSubmit);
  photoInput.addEventListener('change', handlePhotoChange);
  dialog.addEventListener('close', resetForm);
  vehiculeFilter.addEventListener('change', render);
  sortSelect.addEventListener('change', render);
  typeSelect.addEventListener('change', () => {
    typeAutreField.hidden = typeSelect.value !== 'Autre';
  });
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

async function refresh() {
  entretiens = await db.getAll('entretiens');
  await render();
  if (onChangeCallback) onChangeCallback();
}

function getFiltered() {
  let list = entretiens.slice();
  if (vehiculeFilter.value) list = list.filter((e) => e.vehiculeId === vehiculeFilter.value);

  const [field, dir] = sortSelect.value.split('-');
  const key = field === 'date' ? 'dateEntretien' : field === 'km' ? 'kilometrage' : 'prix';
  list.sort((a, b) => {
    const av = a[key], bv = b[key];
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return dir === 'asc' ? cmp : -cmp;
  });
  return list;
}

async function render() {
  const list = getFiltered();
  listEl.innerHTML = '';
  emptyEl.hidden = list.length > 0;

  for (const ent of list) {
    const v = getVehiculeById(ent.vehiculeId);
    const card = document.createElement('div');
    card.className = 'card';

    let thumbHtml = `<div class="card-thumb-placeholder">🔧</div>`;
    if (ent.photoFactureBlobId) {
      const blob = await db.getBlob(ent.photoFactureBlobId);
      if (blob) thumbHtml = `<img class="card-thumb" src="${blobToObjectURL(blob)}" alt="" data-action="photo">`;
    }

    card.innerHTML = `
      ${thumbHtml}
      <div class="card-body">
        <div class="card-title">${escapeHtml(ent.typeEntretien)} — ${escapeHtml(ent.resume || '')}</div>
        <div class="card-subtitle">${vehiculeLabel(v)}${ent.nomGarage ? ' · ' + escapeHtml(ent.nomGarage) : ''}</div>
        <div class="card-meta">
          <span>${formatDate(ent.dateEntretien)}</span>
          <span>${formatKm(ent.kilometrage)}</span>
        </div>
      </div>
      <div class="card-actions">
        <span class="card-price">${formatCurrency(ent.prix)}</span>
        <button type="button" class="icon-btn" data-action="edit" title="Modifier">✏️</button>
        <button type="button" class="icon-btn" data-action="delete" title="Supprimer">🗑️</button>
      </div>
    `;

    const thumbEl = card.querySelector('[data-action="photo"]');
    if (thumbEl) thumbEl.addEventListener('click', () => {
      photoFullImg.src = thumbEl.src;
      photoDialog.showModal();
    });
    card.querySelector('[data-action="edit"]').addEventListener('click', () => openForm(ent.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => confirmDelete(ent.id));

    listEl.appendChild(card);
  }
}

function onFabClick() {
  const activeView = document.querySelector('.view:not([hidden])');
  if (activeView && activeView.id === 'view-entretiens') {
    if (getVehicules().length === 0) {
      showToast('Ajoutez d\'abord un véhicule');
      return;
    }
    openForm(null);
  }
}

function openForm(id) {
  pendingPhotoBlob = null;
  errorEl.hidden = true;
  refreshVehiculeSelects();

  if (id) {
    const ent = entretiens.find((e) => e.id === id);
    titleEl.textContent = 'Modifier l\'entretien';
    document.getElementById('entretien-id').value = ent.id;
    vehiculeSelect.value = ent.vehiculeId;
    document.getElementById('entretien-date').value = ent.dateEntretien;
    document.getElementById('entretien-km').value = ent.kilometrage;

    const knownTypes = Array.from(typeSelect.options).map((o) => o.value).filter((v) => v !== 'Autre');
    if (knownTypes.includes(ent.typeEntretien)) {
      typeSelect.value = ent.typeEntretien;
      typeAutreField.hidden = true;
      typeAutreInput.value = '';
    } else {
      typeSelect.value = 'Autre';
      typeAutreField.hidden = false;
      typeAutreInput.value = ent.typeEntretien;
    }

    document.getElementById('entretien-resume').value = ent.resume || '';
    document.getElementById('entretien-prix').value = ent.prix;
    document.getElementById('entretien-garage').value = ent.nomGarage || '';

    if (ent.photoFactureBlobId) {
      db.getBlob(ent.photoFactureBlobId).then((blob) => {
        if (blob) {
          photoPreview.src = blobToObjectURL(blob);
          photoPreview.hidden = false;
        }
      });
    } else {
      photoPreview.hidden = true;
    }
  } else {
    titleEl.textContent = 'Nouvel entretien';
    form.reset();
    document.getElementById('entretien-id').value = '';
    document.getElementById('entretien-date').value = todayISO();
    typeAutreField.hidden = true;
    photoPreview.hidden = true;
    if (getVehicules().length === 1) vehiculeSelect.value = getVehicules()[0].id;
  }

  dialog.showModal();
}

async function handlePhotoChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    pendingPhotoBlob = await resizeImage(file);
    photoPreview.src = blobToObjectURL(pendingPhotoBlob);
    photoPreview.hidden = false;
  } catch (err) {
    errorEl.textContent = "Impossible de charger cette photo.";
    errorEl.hidden = false;
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  errorEl.hidden = true;

  const id = document.getElementById('entretien-id').value || generateId();
  const isNew = !document.getElementById('entretien-id').value;
  const typeValue = typeSelect.value === 'Autre' ? typeAutreInput.value.trim() : typeSelect.value;

  const entretien = {
    id,
    vehiculeId: vehiculeSelect.value,
    dateEntretien: document.getElementById('entretien-date').value,
    kilometrage: Number(document.getElementById('entretien-km').value),
    typeEntretien: typeValue,
    resume: document.getElementById('entretien-resume').value.trim(),
    prix: Number(document.getElementById('entretien-prix').value),
    nomGarage: document.getElementById('entretien-garage').value.trim(),
    photoFactureBlobId: null,
    dateCreation: new Date().toISOString(),
  };

  if (!entretien.vehiculeId || !entretien.dateEntretien || !typeValue || !entretien.resume) {
    errorEl.textContent = 'Merci de remplir tous les champs obligatoires.';
    errorEl.hidden = false;
    return;
  }

  const existing = isNew ? null : entretiens.find((e) => e.id === id);
  entretien.dateCreation = existing ? existing.dateCreation : entretien.dateCreation;
  entretien.photoFactureBlobId = existing ? existing.photoFactureBlobId : null;

  if (pendingPhotoBlob) {
    const blobId = entretien.photoFactureBlobId || generateId();
    await db.saveBlob(blobId, pendingPhotoBlob);
    entretien.photoFactureBlobId = blobId;
  }

  await db.put('entretiens', entretien);
  dialog.close();
  showToast(isNew ? 'Entretien ajouté' : 'Entretien modifié');
  await refresh();
}

function resetForm() {
  form.reset();
  pendingPhotoBlob = null;
  photoPreview.hidden = true;
  photoPreview.src = '';
  errorEl.hidden = true;
  typeAutreField.hidden = true;
}

async function confirmDelete(id) {
  const ent = entretiens.find((e) => e.id === id);
  const confirmDialog = document.getElementById('dialog-confirm');
  document.getElementById('confirm-title').textContent = 'Supprimer cet entretien ?';
  document.getElementById('confirm-message').textContent = `${ent.typeEntretien} du ${formatDate(ent.dateEntretien)} — action irréversible.`;

  const okBtn = document.getElementById('confirm-ok');
  const handler = async () => {
    okBtn.removeEventListener('click', handler);
    confirmDialog.close();
    if (ent.photoFactureBlobId) await db.deleteBlob(ent.photoFactureBlobId);
    await db.remove('entretiens', id);
    showToast('Entretien supprimé');
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
