import { useState, useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { isValidCoord } from "@shared/cities";

declare global {
  interface Window {
    L: any;
  }
}

interface MapComponentProps {
  latitude?: string;
  longitude?: string;
  properties?: Array<{
    id: number;
    name: string;
    latitude?: string | null;
    longitude?: string | null;
    rent?: number;
    images?: string[] | null;
    address?: string;
  }>;
  selectedId?: number | null;
  height?: string;
}

// Load Leaflet exactly once, even if several maps mount at the same time
let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet-css]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.setAttribute("data-leaflet-css", "1");
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve(window.L);
    script.onerror = () => {
      leafletPromise = null; // allow a retry on the next mount
      reject(new Error("Leaflet failed to load"));
    };
    document.head.appendChild(script);
  });
  return leafletPromise;
}

// Build popup with DOM nodes + textContent: property names/addresses are typed by
// owners, so they must never be injected as HTML.
function buildPopup(p: any): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.minWidth = "200px";
  const img = document.createElement("img");
  img.src = p.images?.[0] || "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=200&h=120&fit=crop";
  img.style.cssText = "width:100%;height:120px;object-fit:cover;border-radius:4px;margin-bottom:8px;";
  const h = document.createElement("h3");
  h.textContent = p.name || "";
  h.style.cssText = "margin:0 0 4px 0;font-size:16px;font-weight:bold;";
  const a = document.createElement("p");
  a.textContent = p.address || "Address not available";
  a.style.cssText = "margin:0 0 4px 0;color:#666;font-size:12px;";
  const r = document.createElement("p");
  r.textContent = `₹${Number(p.rent || 0).toLocaleString()}/month`;
  r.style.cssText = "margin:0;font-size:14px;font-weight:bold;color:#059669;";
  wrap.append(img, h, a, r);
  return wrap;
}

export default function MapComponent({
  latitude = "12.9716",
  longitude = "77.5946",
  properties = [],
  selectedId = null,
  height = "400px",
}: MapComponentProps) {
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [leaflet, setLeaflet] = useState<any>(typeof window !== "undefined" ? window.L : null);
  const [failed, setFailed] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerLayer = useRef<any>(null);
  const markersById = useRef<Map<number, any>>(new Map());

  const centerLat = parseFloat(latitude);
  const centerLng = parseFloat(longitude);
  const centerOk = Number.isFinite(centerLat) && Number.isFinite(centerLng);

  useEffect(() => {
    let alive = true;
    loadLeaflet()
      .then((L) => alive && setLeaflet(L))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // Create the map once
  useEffect(() => {
    if (!leaflet || !mapRef.current || mapInstance.current) return;
    const map = leaflet.map(mapRef.current).setView(
      [centerOk ? centerLat : 20.5937, centerOk ? centerLng : 78.9629],
      centerOk ? 13 : 5,
    );
    leaflet
      .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      })
      .addTo(map);
    markerLayer.current = leaflet.layerGroup().addTo(map);
    mapInstance.current = map;
    setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapInstance.current = null;
      markerLayer.current = null;
      markersById.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaflet]);

  // Refresh markers whenever the properties change (map itself is kept)
  useEffect(() => {
    const map = mapInstance.current;
    const layer = markerLayer.current;
    if (!leaflet || !map || !layer) return;

    layer.clearLayers();
    markersById.current.clear();
    const points: [number, number][] = [];

    properties.forEach((property) => {
      if (!isValidCoord(property.latitude, property.longitude)) return; // never invent a position
      const lat = Number(property.latitude);
      const lng = Number(property.longitude);
      const marker = leaflet.marker([lat, lng]).addTo(layer);
      marker.bindPopup(buildPopup(property));
      marker.on("click", () => setSelectedProperty(property));
      markersById.current.set(property.id, marker);
      points.push([lat, lng]);
    });

    if (points.length > 1) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    } else if (centerOk) {
      map.setView([centerLat, centerLng], 12);
    }
  }, [leaflet, properties, centerLat, centerLng, centerOk]);

  // Focus a listing chosen from the list next to the map
  useEffect(() => {
    if (selectedId == null) return;
    const marker = markersById.current.get(selectedId);
    const map = mapInstance.current;
    if (marker && map) {
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15));
      marker.openPopup();
    }
  }, [selectedId]);

  if (failed) {
    return (
      <div className="w-full rounded-lg border flex items-center justify-center text-center p-4" style={{ height }}>
        <div>
          <MapPin className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            The map could not be loaded. Check your internet connection and reload the page.
          </p>
        </div>
      </div>
    );
  }

  if (!leaflet) {
    return (
      <div
        className="w-full bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-900 dark:to-green-900 rounded-lg relative overflow-hidden border flex items-center justify-center"
        style={{ height }}
      >
        <div className="text-center">
          <MapPin className="h-8 w-8 text-primary mx-auto mb-2 animate-pulse" />
          <p className="text-gray-600 dark:text-gray-400">Loading map...</p>
        </div>
      </div>
    );
  }

  const pinCount = properties.filter((p) => isValidCoord(p.latitude, p.longitude)).length;

  return (
    <div className="w-full rounded-lg relative z-0 isolate overflow-hidden border" style={{ height }}>
      <div ref={mapRef} className="w-full h-full" />

      {pinCount === 0 && (
        <div className="absolute inset-x-4 top-14 z-[1000] rounded-md bg-white/95 dark:bg-gray-800/95 border p-2 text-center text-xs text-gray-600 dark:text-gray-300">
          No properties here have a map location yet.
        </div>
      )}

      {selectedProperty && (
        <div className="absolute bottom-4 left-4 right-4 z-[1000] bg-white dark:bg-gray-800 rounded-lg shadow-xl border p-4">
          <div className="flex items-center space-x-3">
            <img
              src={selectedProperty.images?.[0] || "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=80&h=80&fit=crop"}
              alt={selectedProperty.name}
              className="w-16 h-16 rounded-lg object-cover"
            />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">{selectedProperty.name}</h3>
              <p className="text-sm text-gray-500 truncate">{selectedProperty.address}</p>
              <p className="text-lg font-bold text-primary">₹{Number(selectedProperty.rent || 0).toLocaleString()}/month</p>
            </div>
            <button
              onClick={() => setSelectedProperty(null)}
              aria-label="Close"
              className="text-gray-400 hover:text-gray-600 text-xl font-bold"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="absolute top-4 right-4 z-[1000] bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{pinCount} Properties</p>
          <p className="text-xs text-gray-500">OpenStreetMap</p>
        </div>
      </div>
    </div>
  );
}
