// Canonical destinations used to aggregate "next departures from X" by running parallel
// /api/search calls. Slugs match toStationSlug() output. Lists are intentionally short
// (10-12 entries) to keep cold-cache aggregation under ~8s.

const ROSTER: Record<string, string[]> = {
  "Bucuresti-Nord": ["Brasov", "Cluj-Napoca", "Constanta", "Iasi", "Timisoara-Nord", "Craiova", "Galati", "Sibiu", "Oradea", "Suceava", "Bacau", "Aeroport-Henri-Coanda"],
  "Brasov": ["Bucuresti-Nord", "Sibiu", "Cluj-Napoca", "Predeal", "Sinaia", "Ploiesti", "Targu-Mures", "Sighisoara"],
  "Cluj-Napoca": ["Bucuresti-Nord", "Brasov", "Oradea", "Sibiu", "Sighisoara", "Dej", "Baia-Mare", "Satu-Mare", "Arad"],
  "Constanta": ["Bucuresti-Nord", "Galati", "Brasov", "Mangalia", "Iasi"],
  "Timisoara-Nord": ["Bucuresti-Nord", "Cluj-Napoca", "Arad", "Craiova", "Resita-Sud", "Oradea"],
  "Iasi": ["Bucuresti-Nord", "Cluj-Napoca", "Suceava", "Bacau", "Constanta", "Galati"],
  "Craiova": ["Bucuresti-Nord", "Timisoara-Nord", "Sibiu", "Brasov", "Cluj-Napoca"],
  "Galati": ["Bucuresti-Nord", "Brasov", "Iasi", "Constanta", "Buzau", "Braila"],
  "Sibiu": ["Bucuresti-Nord", "Brasov", "Cluj-Napoca", "Craiova", "Sighisoara"],
  "Oradea": ["Bucuresti-Nord", "Cluj-Napoca", "Arad", "Timisoara-Nord", "Satu-Mare"],
  "Arad": ["Bucuresti-Nord", "Timisoara-Nord", "Cluj-Napoca", "Oradea"],
  "Suceava": ["Bucuresti-Nord", "Iasi", "Cluj-Napoca", "Bacau"],
  "Bacau": ["Bucuresti-Nord", "Iasi", "Suceava", "Cluj-Napoca", "Brasov"],
  "Ploiesti-Vest": ["Bucuresti-Nord", "Brasov", "Predeal", "Buzau"],
};

const FALLBACK = ["Bucuresti-Nord", "Brasov", "Cluj-Napoca", "Timisoara-Nord", "Iasi", "Constanta"];

export function destinationsFor(slug: string): string[] {
  return ROSTER[slug] ?? FALLBACK;
}

export function rosterStations(): string[] {
  return Object.keys(ROSTER);
}
