export type FareTypeId = "73" | "71" | "72" | "50" | "74" | "53";
// 73=Adult, 71=Adult+TrenPlus, 72=Copil, 50=Elev, 74=Student, 53=Pensionar

export type PriceRequest = {
  transactionString: string;
  fareTypeId: FareTypeId;
  serviceKey: string;
};

export type PriceResponse =
  | { ok: true; amount: number; currency: "RON" }
  | { ok: false; reason: "unavailable" | "expired" };
