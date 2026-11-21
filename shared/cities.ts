// Shared by client and server so a PG's city is always stored and matched the same way.

export const SUPPORTED_CITIES = [
  "Mumbai", "Bangalore", "Delhi", "Pune", "Hyderabad", "Chennai", "Kolkata",
  "Ahmedabad", "Noida", "Gurgaon", "Coimbatore", "Kochi", "Indore", "Jaipur",
  "Chandigarh", "Lucknow", "Nagpur",
] as const;

// Alternative spellings / official names -> the name we store
const ALIASES: Record<string, string> = {
  bengaluru: "Bangalore",
  "bengaluru urban": "Bangalore",
  "bangalore urban": "Bangalore",
  bombay: "Mumbai",
  "mumbai suburban": "Mumbai",
  "navi mumbai": "Mumbai",
  "new delhi": "Delhi",
  "delhi ncr": "Delhi",
  gurugram: "Gurgaon",
  madras: "Chennai",
  calcutta: "Kolkata",
  cochin: "Kochi",
  ernakulam: "Kochi",
  poona: "Pune",
  "pimpri-chinchwad": "Pune",
  "greater noida": "Noida",
  secunderabad: "Hyderabad",
};

export const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Bangalore: { lat: 12.9716, lng: 77.5946 },
  Delhi: { lat: 28.7041, lng: 77.1025 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  Noida: { lat: 28.5355, lng: 77.391 },
  Gurgaon: { lat: 28.4595, lng: 77.0266 },
  Coimbatore: { lat: 11.0168, lng: 76.9558 },
  Kochi: { lat: 9.9312, lng: 76.2673 },
  Indore: { lat: 22.7196, lng: 75.8577 },
  Jaipur: { lat: 26.9124, lng: 75.7873 },
  Chandigarh: { lat: 30.7333, lng: 76.7794 },
  Lucknow: { lat: 26.8467, lng: 80.9462 },
  Nagpur: { lat: 21.1458, lng: 79.0882 },
};

const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_m, p, c) => p + c.toUpperCase());

/** "  bengaluru " -> "Bangalore", "pune" -> "Pune", unknown -> Title Case. */
export function normalizeCity(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const key = clean(raw).toLowerCase();
  if (ALIASES[key]) return ALIASES[key];
  const known = SUPPORTED_CITIES.find((c) => c.toLowerCase() === key);
  return known || titleCase(clean(raw));
}

/** Lower-case key used to compare two city strings. */
export const cityKey = (raw: unknown) => normalizeCity(raw).toLowerCase();

/**
 * Find a known city inside a long address string such as
 * "Koramangala, Bengaluru Urban, Karnataka, 560034, India".
 */
export function detectCity(text: string | undefined | null): string {
  if (!text) return "";
  const hay = " " + text.toLowerCase().replace(/[,.;()]/g, " ").replace(/\s+/g, " ") + " ";
  const names = [
    ...SUPPORTED_CITIES.map((c) => c.toLowerCase()),
    ...Object.keys(ALIASES),
  ];
  const hit = names.find((n) => hay.includes(" " + n + " "));
  return hit ? normalizeCity(hit) : "";
}

export function isValidCoord(lat: unknown, lng: unknown): boolean {
  const la = Number(lat), lo = Number(lng);
  return (
    lat !== "" && lng !== "" && lat != null && lng != null &&
    Number.isFinite(la) && Number.isFinite(lo) &&
    la >= -90 && la <= 90 && lo >= -180 && lo <= 180 &&
    !(la === 0 && lo === 0)
  );
}
