import * as db from './db.js';
import { generateId, resizeImage, blobToObjectURL, showToast, vehiculeLabel, formatDate } from './utils.js';

let vehicules = [];
let onChangeCallback = null;
let pendingPhotoBlob = null;
let removePhotoRequested = false;

const listEl = document.getElementById('vehicules-list');
const emptyEl = document.getElementById('vehicules-empty');
const dialog = document.getElementById('dialog-vehicule');
const form = document.getElementById('form-vehicule');
const titleEl = document.getElementById('dialog-vehicule-title');
const errorEl = document.getElementById('vehicule-form-error');
const photoInput = document.getElementById('vehicule-photo');
const photoPreview = document.getElementById('vehicule-photo-preview');

const TYPE_LABELS = {
  voiture: 'Voiture',
  camion: 'Camion',
  moto: 'Moto',
  utilitaire: 'Utilitaire',
  autre: 'Autre',
};

export function getVehicules() {
  return vehicules;
}

export function getVehiculeById(id) {
  return vehicules.find((v) => v.id === id) || null;
}

export async function initVehicules(onChange) {
  onChangeCallback = onChange;
  await refresh();

  document.getElementById('fab').addEventListener('click', onFabClick);
  form.addEventListener('submit', handleSubmit);
  photoInput.addEventListener('change', handlePhotoChange);
  dialog.addEventListener('close', resetForm);
}

async function refresh() {
  vehicules = await db.getAll('vehicules');
  vehicules.sort((a, b) => (a.dateCreation || '').localeCompare(b.dateCreation || ''));
  await render();
}

async function render() {
  listEl.innerHTML = '';
  emptyEl.hidden = vehicules.length > 0;

  for (const v of vehicules) {
    const card = document.createElement('div');
    card.className = 'card';

    let thumbHtml;
    if (v.photoBlobId) {
      const blob = await db.getBlob(v.photoBlobId);
      const url = blob ? blobToObjectURL(blob) : null;
      thumbHtml = url
        ? `<img class="card-thumb" src="${url}" alt="">`
        : `<div class="card-thumb-placeholder">🚗</div>`;
    } else {
      thumbHtml = `<div class="card-thumb-placeholder">🚗</div>`;
    }

    card.innerHTML = `
      ${thumbHtml}
      <div class="card-body">
        <div class="card-title">${escapeHtml(vehiculeLabel(v))}${v.finition ? ' · ' + escapeHtml(v.finition) : ''}</div>
        <div class="card-subtitle">${TYPE_LABELS[v.type] || v.type}${v.immatriculation ? ' · ' + escapeHtml(v.immatriculation) : ''}</div>
        <div class="card-meta">
          ${v.dateMiseEnCirculation ? `<span>Mise en circulation : ${formatDate(v.dateMiseEnCirculation)}</span>` : ''}
        </div>
      </div>
      <div class="card-actions">
        <button type="button" class="icon-btn" data-action="edit" title="Modifier">✏️</button>
        <button type="button" class="icon-btn" data-action="delete" title="Supprimer">🗑️</button>
      </div>
    `;

    card.querySelector('[data-action="edit"]').addEventListener('click', () => openForm(v.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => confirmDelete(v.id));

    listEl.appendChild(card);
  }
}

function onFabClick() {
  const activeView = document.querySelector('.view:not([hidden])');
  if (activeView && activeView.id === 'view-vehicules') {
    openForm(null);
  }
}

function openForm(id) {
  removePhotoRequested = false;
  pendingPhotoBlob = null;
  errorEl.hidden = true;

  if (id) {
    const v = getVehiculeById(id);
    titleEl.textContent = 'Modifier le véhicule';
    document.getElementById('vehicule-id').value = v.id;
    document.getElementById('vehicule-type').value = v.type;
    document.getElementById('vehicule-marque').value = v.marque || '';
    document.getElementById('vehicule-modele').value = v.modele || '';
    document.getElementById('vehicule-finition').value = v.finition || '';
    document.getElementById('vehicule-date-circulation').value = v.dateMiseEnCirculation || '';
    document.getElementById('vehicule-immatriculation').value = v.immatriculation || '';

    if (v.photoBlobId) {
      db.getBlob(v.photoBlobId).then((blob) => {
        if (blob) {
          photoPreview.src = blobToObjectURL(blob);
          photoPreview.hidden = false;
        }
      });
    } else {
      photoPreview.hidden = true;
    }
  } else {
    titleEl.textContent = 'Nouveau véhicule';
    form.reset();
    document.getElementById('vehicule-id').value = '';
    photoPreview.hidden = true;
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
  } catch (err) {
    errorEl.textContent = "Impossible de charger cette photo.";
    errorEl.hidden = false;
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  errorEl.hidden = true;

  const id = document.getElementById('vehicule-id').value || generateId();
  const isNew = !document.getElementById('vehicule-id').value;

  const vehicule = {
    id,
    type: document.getElementById('vehicule-type').value,
    marque: document.getElementById('vehicule-marque').value.trim(),
    modele: document.getElementById('vehicule-modele').value.trim(),
    finition: document.getElementById('vehicule-finition').value.trim(),
    dateMiseEnCirculation: document.getElementById('vehicule-date-circulation').value || '',
    immatriculation: document.getElementById('vehicule-immatriculation').value.trim(),
    photoBlobId: null,
    dateCreation: new Date().toISOString(),
  };

  if (!vehicule.marque || !vehicule.modele) {
    errorEl.textContent = 'Marque et modèle sont obligatoires.';
    errorEl.hidden = false;
    return;
  }

  const existing = isNew ? null : getVehiculeById(id);
  vehicule.dateCreation = existing ? existing.dateCreation : vehicule.dateCreation;
  vehicule.photoBlobId = existing ? existing.photoBlobId : null;

  if (pendingPhotoBlob) {
    const blobId = vehicule.photoBlobId || generateId();
    await db.saveBlob(blobId, pendingPhotoBlob);
    vehicule.photoBlobId = blobId;
  } else if (removePhotoRequested && vehicule.photoBlobId) {
    await db.deleteBlob(vehicule.photoBlobId);
    vehicule.photoBlobId = null;
  }

  await db.put('vehicules', vehicule);
  dialog.close();
  showToast(isNew ? 'Véhicule ajouté' : 'Véhicule modifié');
  await refresh();
  if (onChangeCallback) onChangeCallback();
}

function resetForm() {
  form.reset();
  pendingPhotoBlob = null;
  removePhotoRequested = false;
  photoPreview.hidden = true;
  photoPreview.src = '';
  errorEl.hidden = true;
}

async function confirmDelete(id) {
  const v = getVehiculeById(id);
  const entretiensLies = await db.getAllByIndex('entretiens', 'vehiculeId', id);

  const confirmDialog = document.getElementById('dialog-confirm');
  document.getElementById('confirm-title').textContent = 'Supprimer ce véhicule ?';
  document.getElementById('confirm-message').textContent = entretiensLies.length > 0
    ? `${vehiculeLabel(v)} a ${entretiensLies.length} entretien(s) enregistré(s). Ils seront également supprimés. Cette action est irréversible.`
    : `Supprimer définitivement ${vehiculeLabel(v)} ?`;

  const okBtn = document.getElementById('confirm-ok');
  const handler = async () => {
    okBtn.removeEventListener('click', handler);
    confirmDialog.close();

    for (const ent of entretiensLies) {
      if (ent.photoFactureBlobId) await db.deleteBlob(ent.photoFactureBlobId);
      await db.remove('entretiens', ent.id);
    }
    if (v.photoBlobId) await db.deleteBlob(v.photoBlobId);
    await db.remove('vehicules', id);

    showToast('Véhicule supprimé');
    await refresh();
    if (onChangeCallback) onChangeCallback();
  };
  okBtn.addEventListener('click', handler);
  confirmDialog.showModal();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
