// Fonctions utilitaires partagées

export function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatCurrency(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export function formatKm(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('fr-FR') + ' km';
}

export function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Redimensionne une image côté client avant stockage en IndexedDB.
export function resizeImage(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      img.onerror = () => reject(new Error('Image invalide'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Échec de conversion image'))),
          'image/jpeg',
          quality
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function blobToObjectURL(blob) {
  return URL.createObjectURL(blob);
}

export function showToast(message, duration = 2200) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  // Les messages longs restent affichés plus longtemps (jusqu'à 9 s) ; un appui le ferme plus tôt
  toast.onclick = () => { toast.hidden = true; };
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, Math.min(9000, Math.max(duration, message.length * 70)));
}

export function vehiculeLabel(v) {
  if (!v) return 'Véhicule inconnu';
  return [v.marque, v.modele].filter(Boolean).join(' ') || 'Véhicule sans nom';
}

// Nombre de jours entre aujourd'hui et une date ISO (négatif si la date est passée).
export function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date(todayISO() + 'T00:00:00');
  const target = new Date(iso + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

// Ajoute un nombre de jours à une date ISO et renvoie une date ISO.
export function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
