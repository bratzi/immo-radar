import { deflateSync } from "node:zlib";

/**
 * Erzeugt eine kleine Deutschlandkarte als PNG mit einem roten Punkt an der
 * Objektlage -- damit auf einen Blick erkennbar ist, wo das Objekt liegt.
 *
 * Bewusst ohne Fremddienst und ohne neue Abhaengigkeit: der Umriss steckt als
 * vereinfachtes Polygon hier drin, die Rasterung und die PNG-Kodierung sind
 * von Hand geschrieben (node:zlib reicht dafuer).
 */

/** Vereinfachter Umriss Deutschlands als [Laengengrad, Breitengrad], im Uhrzeigersinn. */
const UMRISS: [number, number][] = [
  [9.43, 54.83], [9.9, 54.8], [10.9, 54.4], [11.3, 54.2], [12.1, 54.2],
  [12.4, 54.5], [13.0, 54.4], [13.4, 54.7], [13.7, 54.3], [14.2, 53.9],
  [14.4, 53.3], [14.6, 52.6], [14.7, 52.1], [14.6, 51.8], [15.0, 51.3],
  [14.8, 50.9], [14.4, 51.0], [14.0, 50.9], [13.5, 50.7], [12.9, 50.4],
  [12.3, 50.2], [12.1, 50.3], [12.5, 49.9], [13.0, 49.4], [13.4, 49.0],
  [13.8, 48.8], [13.4, 48.6], [13.0, 48.3], [12.8, 48.1], [13.0, 47.9],
  [12.9, 47.7], [13.1, 47.6], [12.8, 47.5], [12.2, 47.7], [11.6, 47.6],
  [11.3, 47.4], [10.9, 47.5], [10.5, 47.6], [10.2, 47.4], [10.1, 47.4],
  [9.8, 47.6], [9.6, 47.5], [9.2, 47.7], [8.9, 47.7], [8.6, 47.8],
  [8.4, 47.6], [8.0, 47.6], [7.7, 47.6], [7.6, 47.6], [7.6, 48.0],
  [7.8, 48.6], [8.2, 48.9], [8.1, 49.0], [7.4, 49.2], [6.9, 49.2],
  [6.4, 49.5], [6.4, 49.8], [6.1, 50.0], [6.2, 50.5], [6.0, 50.7],
  [6.0, 51.0], [6.2, 51.4], [6.8, 51.9], [6.7, 52.1], [7.0, 52.4],
  [7.2, 53.2], [7.0, 53.3], [6.9, 53.5], [8.0, 53.7], [8.5, 53.6],
  [8.6, 54.0], [8.9, 54.4], [8.6, 54.9], [9.0, 54.9],
];

/**
 * Naeherungs-Koordinaten je zweistelligem Postleitzahl-Bereich. Reicht fuer
 * "wo in Deutschland liegt das" -- keine hausgenaue Ortung beabsichtigt.
 */
const PLZ_KOORDINATEN: Record<string, [number, number]> = {
  "01": [13.74, 51.05], "02": [14.4, 51.2], "03": [14.33, 51.76], "04": [12.37, 51.34],
  "06": [11.97, 51.48], "07": [11.98, 50.88], "08": [12.5, 50.72], "09": [12.92, 50.83],
  "10": [13.4, 52.52], "12": [13.4, 52.45], "13": [13.35, 52.57], "14": [13.06, 52.4],
  "15": [14.55, 52.34], "16": [13.8, 52.85], "17": [13.26, 53.56], "18": [12.14, 54.09],
  "19": [11.42, 53.63],
  "20": [9.99, 53.55], "21": [10.0, 53.4], "22": [10.05, 53.6], "23": [10.69, 53.87],
  "24": [10.14, 54.32], "25": [9.51, 53.93], "26": [8.21, 53.14], "27": [8.58, 53.55],
  "28": [8.8, 53.08], "29": [10.41, 53.25],
  "30": [9.73, 52.37], "31": [9.6, 52.15], "32": [8.67, 52.11], "33": [8.75, 51.72],
  "34": [9.5, 51.31], "35": [8.77, 50.81], "36": [9.68, 50.55], "37": [9.93, 51.53],
  "38": [10.52, 52.27], "39": [11.63, 52.13],
  "40": [6.77, 51.23], "41": [6.44, 51.19], "42": [7.15, 51.26], "44": [7.47, 51.51],
  "45": [7.01, 51.46], "46": [6.85, 51.6], "47": [6.63, 51.34], "48": [7.63, 51.96],
  "49": [8.05, 52.28],
  "50": [6.96, 50.94], "51": [7.1, 50.95], "52": [6.08, 50.78], "53": [7.1, 50.73],
  "54": [6.64, 49.75], "55": [8.27, 49.99], "56": [7.59, 50.36], "57": [8.02, 50.87],
  "58": [7.47, 51.36], "59": [7.82, 51.68],
  "60": [8.68, 50.11], "61": [8.74, 50.32], "63": [8.9, 50.08], "64": [8.65, 49.87],
  "65": [8.24, 50.08], "66": [6.99, 49.24], "67": [8.44, 49.48], "68": [8.47, 49.49],
  "69": [8.69, 49.4],
  "70": [9.18, 48.78], "71": [9.1, 48.85], "72": [9.06, 48.52], "73": [9.65, 48.7],
  "74": [9.22, 49.14], "75": [8.7, 48.89], "76": [8.4, 49.01], "77": [7.94, 48.47],
  "78": [8.46, 47.94], "79": [7.85, 47.99],
  "80": [11.58, 48.14], "81": [11.6, 48.11], "82": [11.35, 47.99], "83": [12.13, 47.86],
  "84": [12.15, 48.54], "85": [11.43, 48.77], "86": [10.9, 48.37], "87": [10.31, 47.73],
  "88": [9.61, 47.78], "89": [10.0, 48.4],
  "90": [11.08, 49.45], "91": [10.98, 49.45], "92": [11.86, 49.44], "93": [12.1, 49.01],
  "94": [13.43, 48.57], "95": [11.58, 49.95], "96": [10.89, 49.89], "97": [9.94, 49.79],
  "98": [10.69, 50.61], "99": [11.03, 50.98],
};

/** Naeherungs-Koordinaten zu einer Postleitzahl, sonst null. */
export function plzKoordinaten(zipCode: string): { lon: number; lat: number } | null {
  const treffer = zipCode.trim().match(/^(\d{2})\d{3}$/);
  if (!treffer) return null;
  const eintrag = PLZ_KOORDINATEN[treffer[1]];
  return eintrag ? { lon: eintrag[0], lat: eintrag[1] } : null;
}

const BREITE = 420;
const HOEHE = 560;
const RAND = 12;
const LON_MIN = 5.6;
const LON_MAX = 15.4;
const LAT_MIN = 47.1;
const LAT_MAX = 55.2;

const FARBE_HINTERGRUND: [number, number, number] = [246, 247, 249];
const FARBE_LAND: [number, number, number] = [214, 222, 232];
const FARBE_KANTE: [number, number, number] = [120, 136, 156];
const FARBE_PUNKT: [number, number, number] = [220, 38, 38];
const FARBE_PUNKT_RAND: [number, number, number] = [255, 255, 255];

function nachPixel(lon: number, lat: number): [number, number] {
  const x = RAND + ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * (BREITE - 2 * RAND);
  const y = RAND + ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (HOEHE - 2 * RAND);
  return [x, y];
}

function istImPolygon(x: number, y: number, ecken: [number, number][]): boolean {
  let drin = false;
  for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
    const [xi, yi] = ecken[i];
    const [xj, yj] = ecken[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) drin = !drin;
  }
  return drin;
}

function crc32(daten: Uint8Array): number {
  let c = ~0;
  for (const byte of daten) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(typ: string, daten: Uint8Array): Buffer {
  const kopf = Buffer.alloc(8);
  kopf.writeUInt32BE(daten.length, 0);
  kopf.write(typ, 4, "ascii");
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(Buffer.concat([Buffer.from(typ, "ascii"), daten])), 0);
  return Buffer.concat([kopf, Buffer.from(daten), pruef]);
}

function alsPng(pixel: Uint8Array): Uint8Array {
  const zeilen = Buffer.alloc((BREITE * 3 + 1) * HOEHE);
  for (let y = 0; y < HOEHE; y += 1) {
    const ziel = y * (BREITE * 3 + 1);
    zeilen[ziel] = 0; // Filter "None"
    Buffer.from(pixel.subarray(y * BREITE * 3, (y + 1) * BREITE * 3)).copy(zeilen, ziel + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(BREITE, 0);
  ihdr.writeUInt32BE(HOEHE, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 2; // Farbtyp RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(zeilen)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Zeichnet Deutschland mit einem roten Punkt an der uebergebenen Koordinate
 * und gibt die Karte als PNG zurueck.
 */
export function zeichneDeutschlandkarte(lon: number, lat: number): Uint8Array {
  const pixel = new Uint8Array(BREITE * HOEHE * 3);
  const setze = (x: number, y: number, farbe: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= BREITE || y >= HOEHE) return;
    const i = (y * BREITE + x) * 3;
    pixel[i] = farbe[0];
    pixel[i + 1] = farbe[1];
    pixel[i + 2] = farbe[2];
  };

  for (let i = 0; i < BREITE * HOEHE; i += 1) {
    pixel[i * 3] = FARBE_HINTERGRUND[0];
    pixel[i * 3 + 1] = FARBE_HINTERGRUND[1];
    pixel[i * 3 + 2] = FARBE_HINTERGRUND[2];
  }

  const ecken = UMRISS.map(([lo, la]) => nachPixel(lo, la));
  for (let y = 0; y < HOEHE; y += 1) {
    for (let x = 0; x < BREITE; x += 1) {
      if (istImPolygon(x + 0.5, y + 0.5, ecken)) setze(x, y, FARBE_LAND);
    }
  }

  // Umrisslinie nachziehen, damit die Form klar hervortritt
  for (let i = 0; i < ecken.length; i += 1) {
    const [x1, y1] = ecken[i];
    const [x2, y2] = ecken[(i + 1) % ecken.length];
    const schritte = Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)));
    for (let s = 0; s <= schritte; s += 1) {
      const t = schritte === 0 ? 0 : s / schritte;
      const x = Math.round(x1 + (x2 - x1) * t);
      const y = Math.round(y1 + (y2 - y1) * t);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]] as [number, number][]) {
        setze(x + dx, y + dy, FARBE_KANTE);
      }
    }
  }

  const [px, py] = nachPixel(lon, lat);
  const RADIUS = 11;
  for (let dy = -RADIUS - 3; dy <= RADIUS + 3; dy += 1) {
    for (let dx = -RADIUS - 3; dx <= RADIUS + 3; dx += 1) {
      const abstand = Math.sqrt(dx * dx + dy * dy);
      if (abstand <= RADIUS + 3) setze(Math.round(px + dx), Math.round(py + dy), FARBE_PUNKT_RAND);
      if (abstand <= RADIUS) setze(Math.round(px + dx), Math.round(py + dy), FARBE_PUNKT);
    }
  }

  return alsPng(pixel);
}

/** Karte zu einer Postleitzahl, oder null wenn die PLZ unbekannt ist. */
export function kartePngFuerPlz(zipCode: string): Uint8Array | null {
  const koordinaten = plzKoordinaten(zipCode);
  if (koordinaten === null) return null;
  return zeichneDeutschlandkarte(koordinaten.lon, koordinaten.lat);
}
