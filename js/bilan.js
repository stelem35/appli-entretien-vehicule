// Calculs du Bilan (sans accès au DOM : partagés par l'écran Bilan et l'export PDF).

// Réglages des interrupteurs du Bilan, lus aussi par l'export PDF pour garder les mêmes calculs.
export const options = {
  inclureAchat: true,
  inclureAchatsPrecedents: false,
};

export const TYPE_ACHAT = 'Achat du véhicule';

// Seul un type « 1er achat » / « premier achat » désigne l'achat d'un précédent propriétaire
// (« Injecteur / Achat » ou « Achat pneus » sont de vraies dépenses du propriétaire actuel).
export function isAchatPrecedent(type) {
  return /^\s*(1er|1ère|1re|premier|première)\s+achat\s*$/i.test(type || '');
}

// `achat` = achat du véhicule saisi dans la fiche (jamais compté comme un entretien) ;
// `precedent` = entretien de type « 1er achat » d'un précédent propriétaire (compté dans les entretiens s'il est inclus).
// Transforme les entretiens + l'achat saisi dans la fiche véhicule en lignes de dépense homogènes.
export function buildLignes(entretiens, vehicules, { vehiculeId = '', inclureAchat = true, inclureAchatsPrecedents = false } = {}) {
  const lignes = [];

  entretiens.forEach((e) => {
    if (vehiculeId && e.vehiculeId !== vehiculeId) return;
    const precedent = isAchatPrecedent(e.typeEntretien);
    if (precedent && !inclureAchatsPrecedents) return;
    lignes.push({
      vehiculeId: e.vehiculeId,
      date: e.dateEntretien || '',
      type: e.typeEntretien,
      prix: Number(e.prix) || 0,
      km: Number(e.kilometrage) || 0,
      achat: false,
      precedent,
    });
  });

  if (inclureAchat) {
    vehicules.forEach((v) => {
      if (vehiculeId && v.id !== vehiculeId) return;
      const prix = Number(v.prixAchat) || 0;
      if (prix <= 0) return;
      lignes.push({
        vehiculeId: v.id,
        date: v.dateAchat || '',
        type: TYPE_ACHAT,
        prix,
        km: Number(v.kmAchat) || 0,
        achat: true,
        precedent: false,
      });
    });
  }

  return lignes;
}

// Garde les lignes comprises entre debut et fin (dates ISO, bornes incluses, chacune facultative).
export function filterPeriode(lignes, debut, fin) {
  if (debut && fin && debut > fin) return [];
  return lignes.filter((l) => (!debut || l.date >= debut) && (!fin || l.date <= fin));
}

// Total, nombre d'entretiens et coût au km.
// Par véhicule : km parcourus = km du dernier relevé − km du premier relevé de la période ;
// les relevés sans kilométrage (0 ou vide) sont ignorés pour ne pas fausser le point de départ.
export function computeKpis(lignes) {
  const total = lignes.reduce((s, l) => s + l.prix, 0);
  const count = lignes.filter((l) => !l.achat).length;

  const parVehicule = new Map();
  lignes.forEach((l) => {
    if (!parVehicule.has(l.vehiculeId)) parVehicule.set(l.vehiculeId, []);
    parVehicule.get(l.vehiculeId).push(l);
  });

  let km = 0;
  let depenses = 0;
  let premierKm = null;
  let dernierKm = null;
  parVehicule.forEach((list) => {
    const releves = list
      .filter((l) => l.km > 0)
      .sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
    if (releves.length < 2) return;
    const debut = releves[0].km;
    const fin = releves[releves.length - 1].km;
    if (fin - debut <= 0) return;
    km += fin - debut;
    depenses += list.reduce((s, l) => s + l.prix, 0);
    premierKm = debut;
    dernierKm = fin;
  });

  const nbVehicules = [...parVehicule.values()].filter((list) => list.some((l) => l.km > 0)).length;
  return {
    total,
    count,
    km,
    perKm: km > 0 ? depenses / km : null,
    // Détail « de … à … km » seulement quand il n'y a qu'un véhicule concerné.
    premierKm: nbVehicules === 1 ? premierKm : null,
    dernierKm: nbVehicules === 1 ? dernierKm : null,
  };
}
