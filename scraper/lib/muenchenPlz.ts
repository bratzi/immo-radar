/** Muenchner Stadtgebiet: PLZ 80331 bis 81929. Umland (82xxx, 85xxx) nicht. */
export function istMuenchen(plz: string): boolean {
  const n = Number(plz);
  return Number.isInteger(n) && n >= 80331 && n <= 81929;
}

const RING_1 = new Set([
  "80331", "80333", "80335", "80336", "80337", "80339", // Altstadt, Maxvorstadt, Isar-/Ludwigsvorstadt
  "80469", // Glockenbach, Isarvorstadt
  "80538", "80539", // Lehel
  "80634", "80636", "80637", "80638", "80639", // Neuhausen
  "80796", "80797", "80798", "80799", // Maxvorstadt, Schwabing-West
  "80801", "80802", "80803", "80804", "80805", // Schwabing
  "81541", "81543", // Au, Untergiesing
  "81667", "81669", "81671", // Haidhausen
]);

const RING_2 = new Set([
  "80686", "80687", "80689", // Laim
  "80807", "80809", // Milbertshofen
  "80933", "80935", "80937", "80939", // Freimann, Schwabing-Nord
  "81369", "81371", "81373", "81377", "81379", // Sendling, Westpark
  "81475", "81476", "81477", "81479", // Thalkirchen, Solln
  "81673", "81675", "81677", "81679", // Bogenhausen, Berg am Laim
  "81735", "81737", "81739", // Ramersdorf, Perlach
  "81925", "81927", // Bogenhausen
  "80992", "80993", "80997", "80999", // Moosach, Allach
]);

export function ringFuerPlz(plz: string): 1 | 2 | 3 {
  if (RING_1.has(plz)) return 1;
  if (RING_2.has(plz)) return 2;
  return 3;
}
