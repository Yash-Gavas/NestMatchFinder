// @ts-nocheck
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MapPin, Search, ArrowLeft, Star, Navigation, Phone } from "lucide-react";
import MapComponent from "@/components/map-component";
import { useAuth } from "@/lib/auth-context";
import { cityKey, normalizeCity, CITY_COORDS, isValidCoord } from "@shared/cities";
import { RoomTypeList, priceLabel } from "@/components/room-types";
import { getRoomTypes } from "@shared/roomtypes";
import type { Property } from "@shared/schema";

function inBudget(rent: number, budget: string | null) {
  if (!budget) return true;
  if (budget.endsWith("+")) return rent >= parseInt(budget);
  const [min, max] = budget.split("-").map((n) => parseInt(n));
  return rent >= (min || 0) && rent <= (max || Infinity);
}

export default function CityMap() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const cityName = normalizeCity(urlParams.get("city") || "Bangalore");
  const budget = urlParams.get("budget");
  const areaSearch = (urlParams.get("search") || "").split(",")[0].trim().toLowerCase();

  const { data: allProperties = [], isLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  // Same normalised comparison as the home page, so "Bengaluru"/"Bangalore" etc. match
  const cityProperties = allProperties.filter(
    (p) => cityKey(p.city) === cityKey(cityName) && inBudget(Number(p.rent), budget),
  );

  const filteredProperties = cityProperties.filter((p) => {
    const q = searchQuery.trim().toLowerCase() || areaSearch;
    if (!q) return true;
    return (
      p.name?.toLowerCase().includes(q) ||
      p.address?.toLowerCase().includes(q)
    );
  });

  // Only properties with a real pin are drawn - nothing is placed at a random spot
  const pinned = useMemo(
    () => filteredProperties.filter((p) => isValidCoord(p.latitude, p.longitude)),
    [filteredProperties],
  );
  const unpinnedCount = filteredProperties.length - pinned.length;

  const center = useMemo(() => {
    if (pinned.length > 0) {
      const lat = pinned.reduce((s, p) => s + Number(p.latitude), 0) / pinned.length;
      const lng = pinned.reduce((s, p) => s + Number(p.longitude), 0) / pinned.length;
      return { lat, lng };
    }
    return CITY_COORDS[cityName] || CITY_COORDS.Bangalore;
  }, [pinned, cityName]);

  const getDirections = (property: any) => {
    const url = isValidCoord(property.latitude, property.longitude)
      ? `https://www.google.com/maps/dir/?api=1&destination=${property.latitude},${property.longitude}`
      : `https://www.google.com/maps/search/${encodeURIComponent(property.address + ", " + property.city)}`;
    window.open(url, "_blank");
  };

  const goBook = (property: any) => {
    const target = `/booking?propertyId=${property.id}`;
    if (!user) setLocation(`/login?redirect=${encodeURIComponent(target)}`);
    else if (user.userType === "owner") setLocation("/dashboard/owner");
    else setLocation(target);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => setLocation("/")} className="flex items-center">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">PGs in {cityName}</h1>
                <p className="text-gray-600 dark:text-gray-400">
                  {isLoading ? "Loading…" : `${filteredProperties.length} properties found`}
                </p>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search properties..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-full md:w-64"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="lg:col-span-1">
            <Card className="h-[600px]">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MapPin className="w-5 h-5 mr-2" />
                  {cityName} Map View
                </CardTitle>
                {unpinnedCount > 0 && (
                  <p className="text-xs text-amber-600">
                    {unpinnedCount} listing{unpinnedCount > 1 ? "s have" : " has"} no map location yet.
                  </p>
                )}
              </CardHeader>
              <CardContent className="h-full p-0">
                <MapComponent
                  latitude={String(center.lat)}
                  longitude={String(center.lng)}
                  properties={pinned}
                  selectedId={selectedId}
                  height="500px"
                />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {isLoading ? (
                <Card className="p-8 text-center text-gray-500">Loading properties…</Card>
              ) : filteredProperties.length === 0 ? (
                <Card className="p-8 text-center">
                  <div className="text-gray-500 dark:text-gray-400">
                    <MapPin className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium mb-2">No Properties Found</h3>
                    <p className="text-sm">No properties available in {cityName} yet.</p>
                  </div>
                </Card>
              ) : (
                filteredProperties.map((property) => (
                  <Card
                    key={property.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedId === property.id ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => setSelectedId(property.id)}
                  >
                    <div className="flex">
                      <div className="w-32 h-auto flex-shrink-0">
                        <img
                          src={property.images?.[0] || "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=400&h=300&fit=crop"}
                          alt={property.name}
                          className="w-full h-full object-cover rounded-l-lg"
                        />
                      </div>
                      <div className="flex-1 p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{property.name}</h3>
                          <Badge variant={property.gender === "male" ? "default" : "secondary"}>
                            {property.gender}
                          </Badge>
                        </div>
                        <div className="flex items-center text-sm text-gray-500 mb-2">
                          <MapPin className="w-4 h-4 mr-1 shrink-0" />
                          <span className="line-clamp-2">{property.address}</span>
                        </div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center">
                            <Star className="w-4 h-4 text-yellow-400 mr-1" />
                            <span className="text-sm text-gray-500">({property.reviewCount || 0} reviews)</span>
                          </div>
                          <div className="text-lg font-bold text-green-600">
                            {priceLabel(property)}/month
                          </div>
                        </div>
                        {getRoomTypes(property).length > 0 ? (
                          <div className="mb-2"><RoomTypeList property={property} /></div>
                        ) : (
                          <div className="text-xs text-gray-500 mb-2">
                            Deposit ₹{Number(property.securityDeposit || 0).toLocaleString()}
                          </div>
                        )}
                        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-3">
                          <span className={property.availableBeds > 0 ? "" : "text-red-600 font-medium"}>
                            {property.availableBeds > 0
                              ? `${property.availableBeds} of ${property.totalBeds} beds available`
                              : "Full"}
                          </span>
                          <span className="mx-2">•</span>
                          <span className="truncate">{property.amenities?.slice(0, 3).join(", ") || "Basic amenities"}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={property.availableBeds <= 0}
                            onClick={(e) => { e.stopPropagation(); goBook(property); }}
                          >
                            {property.availableBeds > 0 ? "Book now" : "No beds"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); getDirections(property); }}
                          >
                            <Navigation className="w-3 h-3 mr-1" />
                            Directions
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
