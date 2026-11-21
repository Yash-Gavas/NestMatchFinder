import { useState } from "react";
import { getRoomTypes, sharingLabel } from "@shared/roomtypes";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function BookingSimple() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const urlParams = new URLSearchParams(window.location.search);
  const propertyId = urlParams.get("propertyId");

  const [moveInDate, setMoveInDate] = useState("");
  const [moveOutDate, setMoveOutDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const today = new Date().toISOString().split("T")[0];

  // Real property: rent and deposit come from what the owner set
  const { data: property, isLoading, isError } = useQuery<any>({
    queryKey: [`/api/properties/${propertyId}`],
    enabled: !!propertyId,
  });

  // Room types (1/2/3 sharing): each has its own price and beds
  const types = getRoomTypes(property);
  const wanted = Number(urlParams.get("sharing"));
  const [pickedSharing, setPickedSharing] = useState<number | null>(null);
  const selectedType =
    types.find((t) => t.sharing === pickedSharing) ||
    types.find((t) => t.sharing === wanted && t.availableBeds > 0) ||
    types.find((t) => t.availableBeds > 0) ||
    types[0];
  const rent = selectedType ? selectedType.rent : property?.rent;
  const deposit = selectedType ? selectedType.securityDeposit : property?.securityDeposit;
  const bedsLeft = selectedType ? selectedType.availableBeds : property?.availableBeds;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !property) return;
    if (types.length > 0 && !selectedType) return;

    if (!moveInDate || !moveOutDate) {
      toast({ title: "Dates required", description: "Please select both dates.", variant: "destructive" });
      return;
    }
    if (new Date(moveOutDate) <= new Date(moveInDate)) {
      toast({ title: "Check your dates", description: "Move-out must be after move-in.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      // Rent/deposit are intentionally NOT sent: the server takes them from the property
      await apiRequest("POST", "/api/bookings", {
        propertyId: property.id,
        sharing: selectedType?.sharing,
        moveInDate,
        moveOutDate,
      });

      queryClient.invalidateQueries({ queryKey: [`/api/bookings/user/${user.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${property.id}`] });

      toast({
        title: "Booking request sent",
        description: "The owner will review your request. A bed is held for you meanwhile.",
      });
      setLocation("/dashboard/user");
    } catch (error: any) {
      toast({
        title: "Booking failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => setLocation("/dashboard/user")}
          className="mb-6 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
        >
          ← Back to Dashboard
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Book Property</h1>

          {!propertyId || isError ? (
            <p className="text-red-600">This property could not be found. Please pick one from the list.</p>
          ) : isLoading || !property ? (
            <p className="text-gray-500">Loading property…</p>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{property.name}</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  {property.address}, {property.city}
                </p>
                <p className={`text-sm mt-1 ${property.availableBeds > 0 ? "text-green-600" : "text-red-600"}`}>
                  {property.availableBeds > 0
                    ? `${property.availableBeds} of ${property.totalBeds} beds available`
                    : "No beds available right now"}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {types.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Room type *</label>
                    <div className="grid gap-2">
                      {types.map((t) => {
                        const full = t.availableBeds <= 0;
                        const active = selectedType?.sharing === t.sharing;
                        return (
                          <button
                            type="button"
                            key={t.sharing}
                            disabled={full}
                            onClick={() => setPickedSharing(t.sharing)}
                            className={`flex justify-between items-center text-left rounded-lg border p-3 transition-colors ${
                              active ? "border-blue-600 ring-2 ring-blue-200 dark:ring-blue-900" : "border-gray-300 dark:border-gray-600"
                            } ${full ? "opacity-50 cursor-not-allowed" : "hover:border-blue-400"}`}
                          >
                            <span className="font-medium text-gray-900 dark:text-white">{sharingLabel(t.sharing)}</span>
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                              ₹{t.rent.toLocaleString()}/month • deposit ₹{t.securityDeposit.toLocaleString()} •{" "}
                              {full ? "Full" : `${t.availableBeds} free`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Move-in Date *</label>
                  <input type="date" value={moveInDate} min={today} required
                    onChange={(e) => setMoveInDate(e.target.value)} className={inputClass} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Move-out Date *</label>
                  <input type="date" value={moveOutDate} min={moveInDate || today} required
                    onChange={(e) => setMoveOutDate(e.target.value)} className={inputClass} />
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-600 dark:text-gray-300">Monthly Rent:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      ₹{Number(rent).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-300">Security Deposit:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      ₹{Number(deposit || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || bedsLeft <= 0}
                  className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
                    isSubmitting || bedsLeft <= 0
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {isSubmitting ? "Sending Request..." : bedsLeft <= 0 ? "No beds available" : "Send Booking Request"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
