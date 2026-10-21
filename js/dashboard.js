import { getVehicules } from './vehicules.js';
import { getEntretiens } from './entretiens.js';
import { vehiculeLabel, formatKm, formatDate } from './utils.js';
import { options, buildLignes, filterPeriode, computeKpis } from './bilan.js';

const vehiculeSelect = document.getElementById('dashboard-vehicule');
const yearSelect = document.getElementById('dashboard-year');
const periodFields = document.getElementById('dashboard-period-fields');
const dateDebutInput = document.getElementById('dashboard-date-debut');
const dateFinInput = document.getElementById('dashboard-date-fin');
const periodError = document.getElementById('dashboard-period-error');
const achatCheckbox = document.getElementById('dashboard-inclure-achat');
const precedentsCheckbox = document.getElementById('dashboard-inclure-precedents');
const achatHint = document.getElementById('dashboard-achat-hint');
const precedentsNote = document.getElementById('dashboard-precedents-note');
const kpiTotal = document.getElementById('kpi-total');
const kpiCount = document.getElementById('kpi-count');
const kpiPerKm = document.getElementById('kpi-perkm');
const kpiKm = document.getElementById('kpi-km');
const kpiKmDetail = document.getElementById('kpi-km-detail');
const chartYears = document.getElementById('chart-years');
const chartTypes = document.getElementById('chart-types');
const yearsEmpty = document.getElementById('chart-years-empty');
const typesEmpty = document.getElementById('chart-types-empty');

const PERIODE_PERSO = 'custom';

const euros = (n) => Math.round(n).toLocaleString('fr-FR') + ' €';

// Format abrégé pour les barres : 850 €, 1,2 k€, 18,6 k€ (évite que les montants se chevauchent).
const eurosCourt = (n) => {
  if (Math.abs(n) < 1000) return Math.round(n) + ' €';
  return (n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k€';
};

export function initDashboard() {
  refreshFilters();
  [vehiculeSelect, yearSelect, dateDebutInput, dateFinInput, achatCheckbox, precedentsCheckbox].forEach((el) =>
    el.addEventListener('change', render)
  );
  render();
}

export function refreshDashboard() {
  refreshFilters();
  render();
}

function refreshFilters() {
  const vehicules = getVehicules();
  const prevVehicule = vehiculeSelect.value;
  vehiculeSelect.innerHTML = '<option value="">Tous véhicules</option>' +
    vehicules.map((v) => `<option value="${v.id}"></option>`).join('');
  vehicules.forEach((v, i) => { vehiculeSelect.options[i + 1].textContent = vehiculeLabel(v); });
  if (vehicules.some((v) => v.id === prevVehicule)) vehiculeSelect.value = prevVehicule;

  const prevYear = yearSelect.value;
  const dates = [
    ...getEntretiens().map((e) => e.dateEntretien),
    ...vehicules.filter((v) => Number(v.prixAchat) > 0).map((v) => v.dateAchat),
  ];
  const years = [...new Set(dates.filter(Boolean).map((d) => d.slice(0, 4)))].sort().reverse();
  yearSelect.innerHTML = '<option value="">Toutes années</option>' +
    years.map((y) => `<option value="${y}">${y}</option>`).join('') +
    `<option value="${PERIODE_PERSO}">Du … au …</option>`;
  if (years.includes(prevYear) || prevYear === PERIODE_PERSO) yearSelect.value = prevYear;
}

function render() {
  options.inclureAchat = achatCheckbox.checked;
  options.inclureAchatsPrecedents = precedentsCheckbox.checked;

  const mode = yearSelect.value;
  let debut = '';
  let fin = '';
  if (mode === PERIODE_PERSO) {
    debut = dateDebutInput.value;
    fin = dateFinInput.value;
  } else if (mode) {
    debut = `${mode}-01-01`;
    fin = `${mode}-12-31`;
  }
  periodFields.hidden = mode !== PERIODE_PERSO;
  periodError.hidden = !(debut && fin && debut > fin);

  const vehiculeId = vehiculeSelect.value;
  const base = buildLignes(getEntretiens(), getVehicules(), { vehiculeId, ...options });
  const filtered = filterPeriode(base, debut, fin);

  const concernes = getVehicules().filter((v) => !vehiculeId || v.id === vehiculeId);
  // Montre ce que l'interrupteur « précédent propriétaire » exclut ou inclut, pour que l'effet soit vérifiable.
  const precedents = filterPeriode(
    buildLignes(getEntretiens(), getVehicules(), { vehiculeId, inclureAchat: false, inclureAchatsPrecedents: true }),
    debut,
    fin
  ).filter((l) => l.precedent);
  precedentsNote.hidden = precedents.length === 0;
  precedentsNote.textContent = precedents.length === 0 ? '' :
    `${precedents.length} entretien(s) de type « 1er achat » sur la période (${euros(precedents.reduce((s, l) => s + l.prix, 0))}) : ` +
    precedents.map((l) => `${l.type} ${formatDate(l.date)}`).join(', ') +
    (options.inclureAchatsPrecedents ? ' — inclus.' : ' — exclus.');
  achatHint.hidden = !options.inclureAchat || concernes.some((v) => Number(v.prixAchat) > 0);

  renderKpis(filtered);
  // Année choisie : on garde toutes les années (les autres sont atténuées) ; période libre : seulement la période.
  renderYears(mode === PERIODE_PERSO ? filtered : base, mode === PERIODE_PERSO ? '' : mode);
  renderTypes(filtered);
}

function renderKpis(lignes) {
  const k = computeKpis(lignes);
  kpiTotal.textContent = euros(k.total);
  kpiCount.textContent = String(k.count);

  if (k.perKm !== null) {
    kpiPerKm.textContent = k.perKm.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €/km';
    kpiKm.textContent = formatKm(k.km);
  } else {
    kpiPerKm.textContent = '—';
    kpiKm.textContent = '—';
  }

  const detail = k.perKm !== null && k.premierKm !== null
    ? `de ${k.premierKm.toLocaleString('fr-FR')} à ${k.dernierKm.toLocaleString('fr-FR')} km`
    : '';
  kpiKmDetail.textContent = detail;
  kpiKmDetail.hidden = !detail;
}

function renderYears(lignes, selectedYear) {
  const totals = new Map();
  lignes.forEach((l) => {
    if (!l.date) return;
    const y = l.date.slice(0, 4);
    totals.set(y, (totals.get(y) || 0) + l.prix);
  });
  const entries = [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  chartYears.innerHTML = '';
  yearsEmpty.hidden = entries.length > 0;
  const max = Math.max(...entries.map(([, v]) => v), 0);

  entries.forEach(([y, value]) => {
    const col = document.createElement('div');
    col.className = 'bar-col';
    if (selectedYear && selectedYear !== y) col.classList.add('dim');
    col.title = `${y} : ${euros(value)}`;

    const label = document.createElement('span');
    label.className = 'bar-value';
    label.textContent = eurosCourt(value);

    const bar = document.createElement('div');
    bar.className = 'bar-v';
    bar.style.height = max > 0 ? Math.max(4, (value / max) * 100) + '%' : '4px';

    const name = document.createElement('span');
    name.className = 'bar-name';
    name.textContent = y;

    const track = document.createElement('div');
    track.className = 'bar-v-track';
    track.appendChild(bar);

    col.append(label, track, name);
    chartYears.appendChild(col);
  });
}

function renderTypes(lignes) {
  const totals = new Map();
  lignes.forEach((l) => totals.set(l.type, (totals.get(l.type) || 0) + l.prix));
  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  chartTypes.innerHTML = '';
  typesEmpty.hidden = entries.length > 0;
  const max = Math.max(...entries.map(([, v]) => v), 0);

  entries.forEach(([type, value]) => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.title = `${type} : ${euros(value)}`;

    const name = document.createElement('span');
    name.className = 'bar-row-name';
    name.textContent = type;

    const track = document.createElement('div');
    track.className = 'bar-h-track';
    const bar = document.createElement('div');
    bar.className = 'bar-h';
    bar.style.width = max > 0 ? Math.max(1, (value / max) * 100) + '%' : '1%';
    track.appendChild(bar);

    const val = document.createElement('span');
    val.className = 'bar-row-value';
    val.textContent = euros(value);

    row.append(name, track, val);
    chartTypes.appendChild(row);
  });
}
