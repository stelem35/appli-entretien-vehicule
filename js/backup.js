import * as db from './db.js';
import { showToast } from './utils.js';

const BACKUP_VERSION = 1;

const exportBtn = document.getElementById('btn-export-backup');
const importBtn = document.getElementById('btn-import-backup');
const importInput = document.getElementById('backup-import-input');
const confirmDialog = document.getElementById('dialog-confirm');

export function initBackup() {
  exportBtn.addEventListener('click', exportBackup);
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', handleFileSelected);
}

async function exportBackup() {
  exportBtn.disabled = true;
  try {
    const vehicules = await db.getAll('vehicules');
    const entretiens = await db.getAll('entretiens');
    const rappels = await db.getAll('rappels');
    const devis = await db.getAll('devis');

    const blobIds = new Set();
    vehicules.forEach((v) => v.photoBlobId && blobIds.add(v.photoBlobId));
    entretiens.forEach((e) => e.photoFactureBlobId && blobIds.add(e.photoFactureBlobId));
    devis.forEach((d) => d.photoBlobId && blobIds.add(d.photoBlobId));

    const blobs = [];
    for (const id of blobIds) {
      const blob = await db.getBlob(id);
      if (blob) blobs.push({ id, mimeType: blob.type, dataUrl: await blobToDataUrl(blob) });
    }

    const payload = {
      backupVersion: BACKUP_VERSION,
      exportDate: new Date().toISOString(),
      vehicules,
      entretiens,
      rappels,
      devis,
      blobs,
    };

    const fileName = `sauvegarde-entretien-vehicule_${new Date().toISOString().slice(0, 10)}.json`;
    const jsonBlob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const file = new File([jsonBlob], fileName, { type: 'application/json' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Sauvegarde entretien véhicule' });
        showToast('Sauvegarde exportée');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    const url = URL.createObjectURL(jsonBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Sauvegarde téléchargée');
  } catch (err) {
    showToast('Échec de l\'export de la sauvegarde');
  } finally {
    exportBtn.disabled = false;
  }
}

function handleFileSelected(e) {
  const file = e.target.files[0];
  importInput.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let payload;
    try {
      payload = JSON.parse(reader.result);
    } catch (err) {
      showToast('Fichier de sauvegarde invalide');
      return;
    }
    if (!payload || !Array.isArray(payload.vehicules) || !Array.isArray(payload.entretiens)) {
      showToast('Fichier de sauvegarde invalide');
      return;
    }
    confirmRestore(payload);
  };
  reader.onerror = () => showToast('Impossible de lire ce fichier');
  reader.readAsText(file);
}

function confirmRestore(payload) {
  document.getElementById('confirm-title').textContent = 'Restaurer cette sauvegarde ?';
  const parts = [`${payload.vehicules.length} véhicule(s)`, `${payload.entretiens.length} entretien(s)`];
  if (payload.rappels) parts.push(`${payload.rappels.length} rappel(s)`);
  if (payload.devis) parts.push(`${payload.devis.length} devis`);
  const contenu = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}` : parts[0];
  document.getElementById('confirm-message').textContent =
    `Cette sauvegarde contient ${contenu}, datée du ${formatBackupDate(payload.exportDate)}. `
    + 'Toutes les données actuellement enregistrées sur cet appareil seront remplacées. Cette action est irréversible.';

  const okBtn = document.getElementById('confirm-ok');
  okBtn.textContent = 'Restaurer';
  const handler = async () => {
    okBtn.removeEventListener('click', handler);
    okBtn.textContent = 'Supprimer';
    confirmDialog.close();
    await restoreBackup(payload);
  };
  okBtn.addEventListener('click', handler);
  // Sur « Annuler », retire l'écouteur et rend au bouton son libellé « Supprimer ».
  confirmDialog.addEventListener('close', () => {
    okBtn.removeEventListener('click', handler);
    okBtn.textContent = 'Supprimer';
  }, { once: true });
  confirmDialog.showModal();
}

async function restoreBackup(payload) {
  try {
    await db.clear('vehicules');
    await db.clear('entretiens');
    await db.clear('rappels');
    await db.clear('devis');
    await db.clear('blobs');

    for (const blob of payload.blobs || []) {
      const binaryBlob = await dataUrlToBlob(blob.dataUrl, blob.mimeType);
      await db.saveBlob(blob.id, binaryBlob);
    }
    for (const v of payload.vehicules) await db.put('vehicules', v);
    for (const e of payload.entretiens) await db.put('entretiens', e);
    for (const r of payload.rappels || []) await db.put('rappels', r);
    for (const d of payload.devis || []) await db.put('devis', d);

    showToast('Restauration réussie');
    setTimeout(() => window.location.reload(), 600);
  } catch (err) {
    showToast('Échec de la restauration');
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl, mimeType) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return mimeType ? new Blob([blob], { type: mimeType }) : blob;
}

function formatBackupDate(iso) {
  if (!iso) return 'date inconnue';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'date inconnue';
  return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
