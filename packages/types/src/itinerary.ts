export type TrainSegment = {
  trainCategory: string;
  trainNumber: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
};

export type Services = {
  bikeCar: boolean;
  barRestaurant: boolean;
  sleeper: boolean;
  couchette: boolean;
  onlineBuying: boolean;
};

export type PriceFrom = {
  amount: number;
  currency: "RON";
  fareType: string;
  class: string;
};

export type Itinerary = {
  id: string;
  transactionString: string;
  sessionId: string;
  departure: { time: string; station: string; platform?: string };
  arrival: { time: string; station: string; platform?: string };
  duration: { hours: number; minutes: number };
  segments: TrainSegment[];
  transferCount: number;
  priceFrom: PriceFrom | null;
  services: Services;
  trainDetailUrl: string;
  bookingUrl: string;
};
