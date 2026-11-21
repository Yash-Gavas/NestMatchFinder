import { isValidCoord } from "@shared/cities";

/** Look an address up on OpenStreetMap so every PG gets a real map pin. */
export async function geocodeAddress(parts: {
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}): Promise<{ lat: string; lng: string } | null> {
  const attempts = [
    [parts.address, parts.city, parts.state, parts.pincode],
    [parts.address, parts.city],
    [parts.pincode, parts.city, parts.state],
    [parts.city, parts.state],
  ]
    .map((a) => a.filter(Boolean).join(", "))
    .filter(Boolean);

  for (const q of attempts) {
    try {
      const url =
        "https://nominatim.openstreetmap.org/search?" +
        new URLSearchParams({ q, format: "json", limit: "1", countrycodes: "in" });
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (data?.[0] && isValidCoord(data[0].lat, data[0].lon)) {
        return { lat: Number(data[0].lat).toFixed(6), lng: Number(data[0].lon).toFixed(6) };
      }
    } catch {
      // try the next, looser query
    }
  }
  return null;
}
