import type { Station, SearchResponse, PriceResponse, BoardResponse } from "@peron/types";

export const stations: Station[] = [
  { name: "București Nord", isImportant: true },
  { name: "Brașov", isImportant: true },
  { name: "Cluj-Napoca", isImportant: true },
  { name: "Sinaia", isImportant: false },
  { name: "Predeal", isImportant: false },
];

export const searchResponse: SearchResponse = {
  itineraries: [
    {
      id: "itinerary-0",
      transactionString: "tx-mock-0",
      sessionId: "sess-mock",
      departure: { time: "08:30", station: "București Nord" },
      arrival: { time: "11:00", station: "Brașov" },
      duration: { hours: 2, minutes: 30 },
      segments: [
        { trainCategory: "IR", trainNumber: "1741", from: "București Nord", to: "Brașov", departTime: "08:30", arriveTime: "11:00" },
      ],
      transferCount: 0,
      priceFrom: { amount: 41.5, currency: "RON", fareType: "Adult", class: "2" },
      services: { bikeCar: true, barRestaurant: false, sleeper: false, couchette: false, onlineBuying: true },
      trainDetailUrl: "https://bilete.cfrcalatori.ro/ro-RO/Tren/1741",
      bookingUrl: "https://bilete.cfrcalatori.ro/ro-RO/Rute-trenuri/Bucuresti-Nord/Brasov?DepartureDate=21.05.2026",
    },
  ],
  warning: null,
  meta: { parseSuccessRate: 1, latencyMs: 120 },
};

export const priceResponse: PriceResponse = {
  ok: true,
  amount: 41.5,
  currency: "RON",
};

export const boardDeparturesResponse: BoardResponse = {
  station: { name: "Bucuresti Nord", slug: "Bucuresti-Nord" },
  direction: "departures",
  entries: [
    {
      time: "08:30",
      counterpart: { name: "Brasov", slug: "Brasov" },
      via: [],
      train: { category: "IR", number: "1741" },
      durationMinutes: 150,
    },
    {
      time: "10:00",
      counterpart: { name: "Cluj-Napoca", slug: "Cluj-Napoca" },
      via: ["Ploiesti Nord", "Sinaia"],
      train: { category: "IC", number: "535" },
      durationMinutes: 480,
    },
  ],
  updatedAt: new Date().toISOString(),
  source: "aggregated",
};

export const boardArrivalsResponse: BoardResponse = {
  station: { name: "Bucuresti Nord", slug: "Bucuresti-Nord" },
  direction: "arrivals",
  entries: [
    {
      time: "09:15",
      counterpart: { name: "Brasov", slug: "Brasov" },
      via: [],
      train: { category: "IR", number: "1742" },
      durationMinutes: 150,
    },
  ],
  updatedAt: new Date().toISOString(),
  source: "aggregated",
};
