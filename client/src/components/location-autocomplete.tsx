import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

type Suggestion = {
  display: string;
  lat?: string;
  lon?: string;
  city?: string;
  state?: string;
  postcode?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (s: Suggestion) => void;
  placeholder?: string;
  className?: string;
  id?: string;
};

export default function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Search area, landmark, city…",
  className,
  id,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        // OpenStreetMap Nominatim — free, no API key (India-biased)
        const url =
          "https://nominatim.openstreetmap.org/search?" +
          new URLSearchParams({
            q,
            format: "json",
            addressdetails: "1",
            limit: "6",
            countrycodes: "in",
          });
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
        });
        const data = await res.json();
        const mapped: Suggestion[] = (data || []).map((item: any) => {
          const a = item.address || {};
          return {
            display: item.display_name as string,
            lat: item.lat,
            lon: item.lon,
            city:
              a.city ||
              a.town ||
              a.village ||
              a.suburb ||
              a.county ||
              "",
            state: a.state || "",
            postcode: a.postcode || "",
          };
        });
        setSuggestions(mapped);
        setOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => suggestions.length && setOpen(true)}
          placeholder={placeholder}
          className={`pl-9 ${className || ""}`}
          autoComplete="off"
        />
      </div>
      {open && (suggestions.length > 0 || loading) && (
        <ul className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {loading && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Searching…
            </li>
          )}
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange(s.display);
                  onSelect?.(s);
                  setOpen(false);
                }}
              >
                {s.display}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}