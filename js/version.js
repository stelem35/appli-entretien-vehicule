// Numéro de version affiché dans l'app. À augmenter en même temps que CACHE_NAME dans sw.js (même numéro).
export const APP_VERSION = 'v19';

const versionEl = document.getElementById('app-version');
const updateBtn = document.getElementById('app-update-btn');

// Lit la version publiée en ligne dans sw.js (jamais depuis le cache) ; renvoie null hors-ligne.
async function fetchLiveVersion() {
  try {
    const res = await fetch(`sw.js?check=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const match = (await res.text()).match(/CACHE_NAME = 'entretien-vehicule-(v\d+)'/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function checkForUpdate() {
  versionEl.textContent = `Version ${APP_VERSION}`;
  updateBtn.hidden = true;
  const live = await fetchLiveVersion();
  if (live && live !== APP_VERSION) {
    versionEl.textContent = `Version ${APP_VERSION} · ${live} disponible`;
    updateBtn.hidden = false;
  }
}

// Force l'installation de la nouvelle version puis recharge l'app.
async function applyUpdate() {
  updateBtn.disabled = true;
  updateBtn.textContent = 'Mise à jour…';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.update();
      const worker = reg.installing || reg.waiting;
      if (worker && worker.state !== 'activated') {
        await new Promise((resolve) => {
          const done = () => { if (worker.state === 'activated') resolve(); };
          worker.addEventListener('statechange', done);
          setTimeout(resolve, 10000);
        });
      }
    }
  } catch {
    // on recharge quand même : au pire l'ancienne version reste affichée
  }
  location.reload();
}

export function initVersion() {
  updateBtn.addEventListener('click', applyUpdate);
  checkForUpdate();
  // À chaque retour dans l'app (iPhone : réouverture depuis le multitâche), on revérifie.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}
