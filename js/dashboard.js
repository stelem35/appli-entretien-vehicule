import { getVehicules } from './vehicules.js';
import { getEntretiens } from './entretiens.js';
import { vehiculeLabel, formatKm } from './utils.js';

const vehiculeSelect = document.getElementById('dashboard-vehicule');
const yearSelect = document.getElementById('dashboard-year');
const kpiTotal = document.getElementById('kpi-total');
const kpiCount = document.getElementById('kpi-count');
const kpiPerKm = document.getElementById('kpi-perkm');
const kpiKm = document.getElementById('kpi-km');
const chartYears = document.getElementById('chart-years');
const chartTypes = document.getElementById('chart-types');
const yearsEmpty = document.getElementById('chart-years-empty');
const typesEmpty = document.getElementById('chart-types-empty');

const euros = (n) => Math.round(n).toLocaleString('fr-FR') + ' €';

export function initDashboard() {
  refreshFilters();
  vehiculeSelect.addEventListener('change', render);
  yearSelect.addEventListener('change', render);
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
  const years = [...new Set(getEntretiens().map((e) => e.dateEntretien.slice(0, 4)))].sort().reverse();
  yearSelect.innerHTML = '<option value="">Toutes années</option>' +
    years.map((y) => `<option value="${y}">${y}</option>`).join('');
  if (years.includes(prevYear)) yearSelect.value = prevYear;
}

function render() {
  const base = getEntretiens().filter((e) => !vehiculeSelect.value || e.vehiculeId === vehiculeSelect.value);
  const year = yearSelect.value;
  const filtered = year ? base.filter((e) => e.dateEntretien.startsWith(year)) : base;

  renderKpis(filtered);
  renderYears(base, year);
  renderTypes(filtered);
}

function renderKpis(list) {
  const total = list.reduce((s, e) => s + (Number(e.prix) || 0), 0);
  kpiTotal.textContent = euros(total);
  kpiCount.textContent = String(list.length);

  // Coût au km : par véhicule, dépenses / km entre le premier et le dernier entretien.
  let costSum = 0;
  let kmSum = 0;
  const byVehicule = new Map();
  list.forEach((e) => {
    if (!byVehicule.has(e.vehiculeId)) byVehicule.set(e.vehiculeId, []);
    byVehicule.get(e.vehiculeId).push(e);
  });
  byVehicule.forEach((entries) => {
    const kms = entries.map((e) => Number(e.kilometrage) || 0);
    const span = Math.max(...kms) - Math.min(...kms);
    if (span > 0) {
      kmSum += span;
      costSum += entries.reduce((s, e) => s + (Number(e.prix) || 0), 0);
    }
  });

  if (kmSum > 0) {
    kpiPerKm.textContent = (costSum / kmSum).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €/km';
    kpiKm.textContent = formatKm(kmSum);
  } else {
    kpiPerKm.textContent = '—';
    kpiKm.textContent = '—';
  }
}

function renderYears(base, selectedYear) {
  const totals = new Map();
  base.forEach((e) => {
    const y = e.dateEntretien.slice(0, 4);
    totals.set(y, (totals.get(y) || 0) + (Number(e.prix) || 0));
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
    label.textContent = euros(value);

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

function renderTypes(list) {
  const totals = new Map();
  list.forEach((e) => totals.set(e.typeEntretien, (totals.get(e.typeEntretien) || 0) + (Number(e.prix) || 0)));
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
