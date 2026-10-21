import { initVehicules } from './vehicules.js';
import { initEntretiens, refreshVehiculeSelects } from './entretiens.js';
import { initExport, refreshVehiculeFilter, onDataChanged } from './export.js';
import { initDashboard, refreshDashboard } from './dashboard.js';
import { initDevis, reloadDevis, refreshVehiculeSelects as refreshDevisVehiculeSelects } from './devis.js';
import { initRappels, refreshVehiculeSelects as refreshRappelVehiculeSelects, onDataChanged as onRappelsDataChanged } from './rappels.js';
import { initBackup } from './backup.js';
import { initVersion } from './version.js';

const VIEW_TITLES = {
  vehicules: 'Véhicules',
  entretiens: 'Entretiens',
  devis: 'Devis',
  rappels: 'Rappels',
  dashboard: 'Bilan',
  export: 'Export',
};

function switchView(view) {
  document.querySelectorAll('.view').forEach((el) => {
    el.hidden = el.id !== `view-${view}`;
  });
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  document.getElementById('app-title').textContent = VIEW_TITLES[view];
  document.getElementById('fab').hidden = view === 'export' || view === 'dashboard';
}

function initNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

function initDialogClosers() {
  document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.closeDialog).close();
    });
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {
        // Le fonctionnement hors-ligne ne sera pas disponible, l'app reste utilisable en ligne.
      });
    });
  }
}

async function main() {
  initNav();
  initDialogClosers();
  registerServiceWorker();

  await initVehicules(() => {
    refreshVehiculeSelects();
    refreshVehiculeFilter();
    refreshRappelVehiculeSelects();
    refreshDevisVehiculeSelects();
    reloadDevis();
    onDataChanged();
    refreshDashboard();
    onRappelsDataChanged();
  });
  await initEntretiens(() => {
    onDataChanged();
    refreshDashboard();
    onRappelsDataChanged();
  });
  await initExport();
  await initDevis();
  initDashboard();
  await initRappels();
  initBackup();
  initVersion();
}

main();
