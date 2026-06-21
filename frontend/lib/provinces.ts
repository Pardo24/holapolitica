/**
 * Approximate centroid (lat, lng) of each Spanish electoral constituency, keyed
 * by the exact name the Congreso open data uses — so it matches the picker
 * options in "El teu diputat".
 *
 * Used to map a device's GPS position to its province ENTIRELY ON THE DEVICE
 * (nearest centroid), so the coordinates never leave the browser — no external
 * geocoder, no privacy leak. Nearest-centroid can misclassify near a border;
 * the user can always correct the picker.
 */
export const PROVINCE_CENTROIDS: Record<string, [number, number]> = {
  Albacete: [38.99, -1.86],
  'Alicante/Alacant': [38.5, -0.65],
  Almería: [37.1, -2.3],
  'Araba/Álava': [42.85, -2.67],
  Asturias: [43.3, -5.99],
  Badajoz: [38.7, -6.4],
  'Balears (Illes)': [39.57, 2.92],
  Barcelona: [41.6, 2.0],
  Bizkaia: [43.26, -2.93],
  Burgos: [42.34, -3.5],
  Cantabria: [43.2, -4.03],
  'Castellón/Castelló': [40.2, -0.2],
  Ceuta: [35.89, -5.31],
  'Ciudad Real': [38.98, -3.93],
  'Coruña (A)': [43.1, -8.4],
  Cuenca: [39.95, -2.1],
  Cáceres: [39.7, -6.1],
  Cádiz: [36.5, -5.8],
  Córdoba: [38.0, -4.78],
  Gipuzkoa: [43.21, -2.2],
  Girona: [42.05, 2.7],
  Granada: [37.3, -3.2],
  Guadalajara: [40.85, -2.6],
  Huelva: [37.6, -6.9],
  Huesca: [42.3, -0.1],
  Jaén: [38.0, -3.4],
  León: [42.6, -5.85],
  Lleida: [42.0, 1.0],
  Lugo: [43.0, -7.4],
  Madrid: [40.42, -3.7],
  Melilla: [35.29, -2.94],
  Murcia: [38.0, -1.4],
  Málaga: [36.8, -4.7],
  Navarra: [42.7, -1.65],
  Ourense: [42.2, -7.55],
  Palencia: [42.4, -4.5],
  'Palmas (Las)': [28.5, -15.0],
  Pontevedra: [42.4, -8.5],
  'Rioja (La)': [42.3, -2.5],
  'S/C Tenerife': [28.4, -16.5],
  Salamanca: [40.85, -6.1],
  Segovia: [41.0, -4.0],
  Sevilla: [37.5, -5.9],
  Soria: [41.65, -2.55],
  Tarragona: [41.1, 0.9],
  Teruel: [40.55, -0.9],
  Toledo: [39.7, -4.0],
  'Valencia/València': [39.4, -0.7],
  Valladolid: [41.65, -4.75],
  Zamora: [41.65, -5.95],
  Zaragoza: [41.55, -1.0],
  Ávila: [40.5, -5.0],
};

/** Nearest constituency name to a GPS position, or null if none is in range.
 *  Distance weights longitude by cos(lat) so it's roughly metric. */
export function nearestProvince(lat: number, lng: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  const cos = Math.cos((lat * Math.PI) / 180);
  for (const [name, [plat, plng]] of Object.entries(PROVINCE_CENTROIDS)) {
    const dlat = lat - plat;
    const dlng = (lng - plng) * cos;
    const d = dlat * dlat + dlng * dlng;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}
