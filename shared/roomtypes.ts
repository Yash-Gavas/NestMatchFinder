// Room types: a PG can offer 1-, 2-, 3-sharing ... rooms, each with its own price and beds.

export type RoomType = {
  sharing: number; // how many people share the room (1 = private)
  rent: number; // per bed, per month
  securityDeposit: number;
  totalBeds: number;
  availableBeds: number;
};

export const SHARING_OPTIONS = [1, 2, 3, 4, 5, 6];

export const sharingLabel = (n: number) => (n === 1 ? "1 sharing (private)" : `${n} sharing`);

export function getRoomTypes(property: any): RoomType[] {
  const rt = property?.roomTypes;
  if (!Array.isArray(rt)) return [];
  return rt
    .map((t: any) => ({
      sharing: Number(t.sharing),
      rent: Number(t.rent),
      securityDeposit: Number(t.securityDeposit || 0),
      totalBeds: Number(t.totalBeds),
      availableBeds: Number(t.availableBeds),
    }))
    .sort((a, b) => a.sharing - b.sharing);
}

const toInt = (v: any) => (v === "" || v == null ? NaN : Math.trunc(Number(v)));

/** Strictly validate a full list of room types. */
export function parseRoomTypes(input: any): { types?: RoomType[]; error?: string } {
  if (!Array.isArray(input) || input.length === 0) return { error: "Add at least one room type" };
  if (input.length > SHARING_OPTIONS.length) return { error: "Too many room types" };
  const seen = new Set<number>();
  const types: RoomType[] = [];
  for (const t of input) {
    const sharing = toInt(t?.sharing);
    const rent = toInt(t?.rent);
    const securityDeposit =
      t?.securityDeposit === "" || t?.securityDeposit == null ? 0 : toInt(t.securityDeposit);
    const totalBeds = toInt(t?.totalBeds);
    const availableBeds =
      t?.availableBeds === "" || t?.availableBeds == null ? totalBeds : toInt(t.availableBeds);
    const label = Number.isFinite(sharing) ? sharingLabel(sharing) : "A room type";
    if (!SHARING_OPTIONS.includes(sharing)) return { error: "Sharing must be between 1 and 6" };
    if (seen.has(sharing)) return { error: `${label} is added twice` };
    seen.add(sharing);
    if (!(rent > 0)) return { error: `${label}: rent must be greater than 0` };
    if (!(securityDeposit >= 0)) return { error: `${label}: deposit cannot be negative` };
    if (!(totalBeds >= 1)) return { error: `${label}: total beds must be at least 1` };
    if (!(availableBeds >= 0) || availableBeds > totalBeds)
      return { error: `${label}: available beds cannot be more than total beds` };
    types.push({ sharing, rent, securityDeposit, totalBeds, availableBeds });
  }
  return { types: types.sort((a, b) => a.sharing - b.sharing) };
}

/** Property-level numbers derived from its room types (starting price, bed totals). */
export function aggregateRoomTypes(types: RoomType[]) {
  const cheapest = types.reduce((m, t) => (t.rent < m.rent ? t : m), types[0]);
  return {
    rent: cheapest.rent,
    securityDeposit: cheapest.securityDeposit,
    totalBeds: types.reduce((s, t) => s + t.totalBeds, 0),
    availableBeds: types.reduce((s, t) => s + t.availableBeds, 0),
  };
}
