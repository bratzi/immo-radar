export interface ImmoweltDetailData {
  externalId: string;
  url: string;
  title: string;
  priceCents: number;
  livingAreaM2: number | null;
  plotAreaM2: number | null;
  rooms: number | null;
  yearBuilt: number | null;
  zipCode: string;
  city: string;
  units: number | null;
  unitsConfident: boolean;
  rentColdMonthly: number | null;
  descriptionText: string;
}

interface ImmoweltFact {
  type: string;
  splitValue: string;
}

interface ImmoweltEnergyFeature {
  type: string;
  value: string;
}

const SERVERREQUEST_PATTERN =
  /<script id="__UFRN_LIFECYCLE_SERVERREQUEST__">window\["__UFRN_LIFECYCLE_SERVERREQUEST__"\]=JSON\.parse\("([\s\S]*?)"\);?<\/script>/;

const UNIT_COUNT_PATTERN = /(\d+)\s*(?:Wohneinheiten|WE\b|Parteien|Wohnungen)/i;
const RENT_PATTERN =
  /(?:Kaltmiete|Ist-Miete|monatliche(?:n)? Miete)[^\d]{0,25}(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*€/i;

function parseGermanNumber(text: string): number {
  const cleaned = text.replace(/[^\d,]/g, "").replace(",", ".");
  return parseFloat(cleaned);
}

function extractClassified(html: string): any {
  const match = html.match(SERVERREQUEST_PATTERN);
  if (!match) {
    throw new Error(
      "__UFRN_LIFECYCLE_SERVERREQUEST__ nicht gefunden — Immowelt-Seitenstruktur hat sich vermutlich geändert."
    );
  }
  const jsonText = JSON.parse(`"${match[1]}"`);
  const parsed = JSON.parse(jsonText);
  return parsed.app_cldp.data.classified;
}

export function parseImmoweltDetailPage(
  html: string,
  kontext: { externalId: string; url: string }
): ImmoweltDetailData {
  const classified = extractClassified(html);
  const hardFacts = classified.sections.hardFacts;
  const address = classified.sections.location.address;
  const energyFeatures: ImmoweltEnergyFeature[] = classified.sections.energy?.features ?? [];
  const yearFeature = energyFeatures.find((f) => f.type === "yearOfConstruction");
  const facts: ImmoweltFact[] = hardFacts.facts ?? [];
  const factByType = (type: string) => facts.find((f) => f.type === type);

  const description: string = [
    classified.sections.mainDescription?.headline ?? "",
    classified.sections.mainDescription?.description ?? "",
  ].join("\n");

  const unitMatch = description.match(UNIT_COUNT_PATTERN);
  const rentMatch = description.match(RENT_PATTERN);

  const livingSpace = factByType("livingSpace");
  const plotSpace = factByType("plotSpace");
  const rooms = factByType("numberOfRooms");

  return {
    externalId: kontext.externalId,
    url: kontext.url,
    title: hardFacts.title,
    priceCents: Math.round(parseGermanNumber(hardFacts.price.value) * 100),
    livingAreaM2: livingSpace ? parseGermanNumber(livingSpace.splitValue) : null,
    plotAreaM2: plotSpace ? parseGermanNumber(plotSpace.splitValue) : null,
    rooms: rooms ? parseGermanNumber(rooms.splitValue) : null,
    yearBuilt: yearFeature ? parseInt(yearFeature.value, 10) : null,
    zipCode: address.zipCode,
    city: address.city,
    units: unitMatch ? parseInt(unitMatch[1], 10) : null,
    unitsConfident: unitMatch !== null,
    rentColdMonthly: rentMatch ? parseGermanNumber(rentMatch[1]) : null,
    descriptionText: description,
  };
}
