import { z } from "zod";

const TimeSchema = z.string().regex(/^\d{1,2}:\d{2}$/, "HH:MM format");

const StationStopSchema = z.object({
  time: TimeSchema,
  station: z.string().min(1),
  platform: z.string().optional(),
});

const SegmentSchema = z.object({
  trainCategory: z.string().min(1),
  trainNumber: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  departTime: TimeSchema,
  arriveTime: TimeSchema,
});

const ServicesSchema = z.object({
  bikeCar: z.boolean(),
  barRestaurant: z.boolean(),
  sleeper: z.boolean(),
  couchette: z.boolean(),
  onlineBuying: z.boolean(),
});

const PriceFromSchema = z.object({
  amount: z.number().positive(),
  currency: z.literal("RON"),
  fareType: z.literal("Adult"),
  class: z.enum(["1", "2"]),
});

export const ItinerarySchema = z
  .object({
    id: z.string().regex(/^itinerary-\d+$/),
    transactionString: z.string().min(1),
    sessionId: z.string().min(1),
    departure: StationStopSchema,
    arrival: StationStopSchema,
    duration: z.object({
      hours: z.number().int().min(0),
      minutes: z.number().int().min(0).max(59),
    }),
    segments: z.array(SegmentSchema).min(1),
    transferCount: z.number().int().min(0),
    priceFrom: PriceFromSchema.nullable(),
    services: ServicesSchema,
    trainDetailUrl: z.string().url(),
    bookingUrl: z.string().url(),
  })
  .strip();

export const PriceSnippetSchema = z.object({
  amount: z.number().positive(),
  currency: z.literal("RON"),
});

export type ItineraryParsed = z.infer<typeof ItinerarySchema>;
export type PriceSnippetParsed = z.infer<typeof PriceSnippetSchema>;
