import * as db from './db.js';
import { getVehicules, getVehiculeById } from './vehicules.js';
import { getEntretiens } from './entretiens.js';
import { vehiculeLabel, formatDate, formatCurrency, formatKm, debounce, showToast } from './utils.js';
import { options as bilanOptions, buildLignes, filterPeriode, computeKpis } from './bilan.js';

const TYPES = [
  'Vidange', 'Révision', 'Freins', 'Pneus', 'Distribution/courroie',
  'Filtres', 'Contrôle technique', 'Batterie', 'Climatisation', 'Amortisseurs', 'Autre',
];

const vehiculeSelect = document.getElementById('export-vehicule');
const typeSelect = document.getElementById('export-type');
const texteInput = document.getElementById('export-texte');
const dateDebutInput = document.getElementById('export-date-debut');
const dateFinInput = document.getElementById('export-date-fin');

const listEl = document.getElementById('export-list');
const emptyEl = document.getElementById('export-empty');
const countEl = document.getElementById('export-count');
const totalEl = document.getElementById('export-total');
const generateBtn = document.getElementById('btn-generate-pdf');

export async function initExport() {
  typeSelect.innerHTML = '<option value="">Tous les types</option>' +
    TYPES.map((t) => `<option value="${t}">${t}</option>`).join('');

  refreshVehiculeFilter();

  const rerender = debounce(render, 200);
  [vehiculeSelect, typeSelect, dateDebutInput, dateFinInput].forEach((el) =>
    el.addEventListener('change', render)
  );
  texteInput.addEventListener('input', rerender);

  generateBtn.addEventListener('click', generatePdf);

  await render();
}

export function refreshVehiculeFilter() {
  const vehicules = getVehicules();
  const previous = vehiculeSelect.value;
  vehiculeSelect.innerHTML = '<option value="">Tous les véhicules</option>' +
    vehicules.map((v) => `<option value="${v.id}">${escapeHtml(vehiculeLabel(v))}</option>`).join('');
  if (vehicules.some((v) => v.id === previous)) vehiculeSelect.value = previous;
}

export function onDataChanged() {
  render();
}

function getFiltered() {
  const vehiculeId = vehiculeSelect.value;
  const type = typeSelect.value;
  const texte = texteInput.value.trim().toLowerCase();
  const debut = dateDebutInput.value;
  const fin = dateFinInput.value;

  return getEntretiens()
    .filter((e) => !vehiculeId || e.vehiculeId === vehiculeId)
    .filter((e) => !type || e.typeEntretien === type)
    .filter((e) => !debut || e.dateEntretien >= debut)
    .filter((e) => !fin || e.dateEntretien <= fin)
    .filter((e) => {
      if (!texte) return true;
      return (e.resume || '').toLowerCase().includes(texte)
        || (e.nomGarage || '').toLowerCase().includes(texte)
        || (e.typeEntretien || '').toLowerCase().includes(texte);
    })
    .sort((a, b) => b.dateEntretien.localeCompare(a.dateEntretien));
}

async function render() {
  const list = getFiltered();
  listEl.innerHTML = '';
  emptyEl.hidden = list.length > 0;

  let total = 0;
  const multiVehicule = !vehiculeSelect.value;

  for (const ent of list) {
    total += Number(ent.prix) || 0;
    const v = getVehiculeById(ent.vehiculeId);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-thumb-placeholder">📄</div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(ent.typeEntretien)} — ${escapeHtml(ent.resume || '')}</div>
        <div class="card-subtitle">${multiVehicule ? vehiculeLabel(v) + ' · ' : ''}${escapeHtml(ent.nomGarage || '')}</div>
        <div class="card-meta">
          <span>${formatDate(ent.dateEntretien)}</span>
          <span>${formatKm(ent.kilometrage)}</span>
        </div>
      </div>
      <span class="card-price">${formatCurrency(ent.prix)}</span>
    `;
    listEl.appendChild(card);
  }

  countEl.textContent = `${list.length} entretien(s)`;
  totalEl.textContent = formatCurrency(total);
}

async function generatePdf() {
  const list = getFiltered();
  if (list.length === 0) {
    showToast('Aucun entretien à exporter');
    return;
  }
  if (!window.jspdf) {
    showToast('PDF indisponible (bibliothèque non chargée)');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const multiVehicule = !vehiculeSelect.value;
  const vehiculeTitre = multiVehicule ? 'Tous les véhicules' : vehiculeLabel(getVehiculeById(vehiculeSelect.value));

  const drawHeader = () => {
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Historique d\'entretien', 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(vehiculeTitre, 14, 23);
  };

  const head = multiVehicule
    ? [['Véhicule', 'Date', 'Km', 'Type', 'Résumé', 'Prix', 'Garage']]
    : [['Date', 'Km', 'Type', 'Résumé', 'Prix', 'Garage']];

  const body = list.map((e) => {
    const v = getVehiculeById(e.vehiculeId);
    const row = [
      formatDate(e.dateEntretien),
      formatKm(e.kilometrage),
      e.typeEntretien,
      e.resume || '',
      formatCurrency(e.prix),
      e.nomGarage || '',
    ];
    if (multiVehicule) row.unshift(vehiculeLabel(v));
    return row;
  });

  const total = list.reduce((sum, e) => sum + (Number(e.prix) || 0), 0);

  // Synthèse identique au Bilan (mêmes calculs, mêmes interrupteurs) ; sans filtre type/texte,
  // car un coût au km n'a de sens que sur l'ensemble des dépenses de la période.
  let startY = 26;
  if (!typeSelect.value && !texteInput.value.trim()) {
    const lignes = filterPeriode(
      buildLignes(getEntretiens(), getVehicules(), { vehiculeId: vehiculeSelect.value, ...bilanOptions }),
      dateDebutInput.value,
      dateFinInput.value
    );
    const k = computeKpis(lignes);
    const euros = (n) => Math.round(n).toLocaleString('fr-FR') + ' €';
    const periode = dateDebutInput.value || dateFinInput.value
      ? `Période : ${dateDebutInput.value ? 'du ' + formatDate(dateDebutInput.value) : ''}${dateFinInput.value ? ' au ' + formatDate(dateFinInput.value) : ''}`
      : 'Période : toutes années';
    const synthese = [
      `${periode} · Dépenses (hors carburant et assurance) : ${euros(k.total)}${bilanOptions.inclureAchat ? ' (achat inclus)' : ''}`,
      k.perKm !== null
        ? `Coût au km : ${k.perKm.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/km sur ${formatKm(k.km)} pris en compte`
        : 'Coût au km : non calculable (au moins deux relevés avec kilométrage nécessaires)',
    ];
    startY = 26 + synthese.length * 5 + 3;
    doc.setFontSize(9);
    doc.setTextColor(60);
    synthese.forEach((line, i) => doc.text(line, 14, 29 + i * 5));
  }

  doc.autoTable({
    head,
    body,
    startY,
    margin: { top: 26 },
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 23, 42] },
    foot: [multiVehicule
      ? ['', '', '', '', 'Total', formatCurrency(total), '']
      : ['', '', '', 'Total', formatCurrency(total), '']],
    footStyles: { fillColor: [226, 232, 240], textColor: 20 },
    didDrawPage: drawHeader,
  });

  const fileName = `entretiens_${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = doc.output('blob');

  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Historique d\'entretien' });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      // en cas d'échec du partage, on bascule sur le téléchargement
    }
  }
  doc.save(fileName);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
