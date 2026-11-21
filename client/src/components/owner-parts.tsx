// @ts-nocheck
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Phone, Mail, User, Plus, Minus, BedDouble } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { getRoomTypes, sharingLabel } from "@shared/roomtypes";
import { useToast } from "@/hooks/use-toast";

export const tenantName = (b: any) =>
  b.userName || [b.userFirstName, b.userLastName].filter(Boolean).join(" ") || "Tenant";

const monthLabel = (key: string) => {
  const [y, m] = String(key).split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
};

/** Everything the owner needs to decide on a request / know who lives in the PG. */
export function TenantInfo({ booking }: { booking: any }) {
  const bits = [
    booking.userAge ? `${booking.userAge} yrs` : null,
    booking.userGender || null,
    booking.userProfession || booking.userOccupation || null,
    booking.userCompany || null,
  ].filter(Boolean);
  return (
    <div className="text-sm space-y-0.5">
      <p className="font-semibold flex items-center gap-1">
        <User className="w-4 h-4" /> {tenantName(booking)}
      </p>
      {bits.length > 0 && <p className="text-gray-500 capitalize">{bits.join(" • ")}</p>}
      <p className="text-gray-500 flex items-center gap-1">
        <Mail className="w-3 h-3" /> {booking.userEmail}
      </p>
      {booking.userPhone && booking.userPhone !== "N/A" && (
        <p className="text-gray-500 flex items-center gap-1">
          <Phone className="w-3 h-3" />
          <a href={`tel:${booking.userPhone}`} className="underline">{booking.userPhone}</a>
        </p>
      )}
      {booking.compatibilityScore != null && (
        <p className="text-gray-500">Compatibility: {Math.round(Number(booking.compatibilityScore))}%</p>
      )}
    </div>
  );
}

/** Tenants of one property + bed controls, shown inside "Manage property". */
export function TenantsAndBeds({
  property,
  bookings,
  onPropertyChange,
}: {
  property: any;
  bookings: any[];
  onPropertyChange: (p: any) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const types = getRoomTypes(property);
  const tenants = bookings.filter((b) => b.propertyId === property.id && b.status === "approved");
  const pending = bookings.filter((b) => b.propertyId === property.id && b.status === "pending");
  const refresh = () => {
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/") });
  };

  const bedMutation = useMutation({
    mutationFn: async (v: { action: "add" | "free" | "remove"; sharing?: number }) => {
      const res = await apiRequest("POST", `/api/properties/${property.id}/beds`, v);
      return res.json();
    },
    onSuccess: (updated) => {
      onPropertyChange({ ...property, ...updated });
      refresh();
      toast({
        title: "Beds updated",
        description: `${updated.availableBeds} of ${updated.totalBeds} beds available.`,
      });
    },
    onError: (e: any) => toast({ title: "Could not update beds", description: e.message, variant: "destructive" }),
  });

  const removeTenant = useMutation({
    mutationFn: async (bookingId: number) => {
      const res = await apiRequest("PATCH", `/api/bookings/${bookingId}`, { status: "removed" });
      return res.json();
    },
    onSuccess: async () => {
      // Pull the fresh property so the dialog shows the bed that just became free
      try {
        const res = await apiRequest("GET", `/api/properties/${property.id}`);
        onPropertyChange(await res.json());
      } catch {
        // ignore
      }
      refresh();
      toast({ title: "Tenant removed", description: "Their bed is available again." });
    },
    onError: (e: any) => toast({ title: "Could not remove tenant", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <BedDouble className="w-4 h-4" /> Beds: {property.availableBeds} available of {property.totalBeds}
          {pending.length > 0 && (
            <span className="text-xs text-amber-600">({pending.length} held by pending requests)</span>
          )}
        </Label>
        {(types.length > 0 ? types : [null]).map((t: any) => {
          const sharing = t ? t.sharing : undefined;
          return (
            <div key={sharing ?? "all"} className="border rounded-lg p-3 space-y-2">
              {t && (
                <p className="text-sm font-medium">
                  {sharingLabel(t.sharing)} • ₹{t.rent.toLocaleString()}/bed • {t.availableBeds} of {t.totalBeds} free
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={bedMutation.isPending} onClick={() => bedMutation.mutate({ action: "add", sharing })}>
                  <Plus className="w-4 h-4 mr-1" /> Add a bed
                </Button>
                <Button size="sm" variant="outline" disabled={bedMutation.isPending} onClick={() => bedMutation.mutate({ action: "free", sharing })}>
                  <Plus className="w-4 h-4 mr-1" /> Bed became empty (+1)
                </Button>
                <Button size="sm" variant="outline" disabled={bedMutation.isPending} onClick={() => bedMutation.mutate({ action: "remove", sharing })}>
                  <Minus className="w-4 h-4 mr-1" /> Remove an empty bed
                </Button>
              </div>
            </div>
          );
        })}
        <p className="text-xs text-gray-500">
          Removing a tenant below frees their bed automatically.
        </p>
      </div>

      <div>
        <Label className="mb-2 block">Current tenants ({tenants.length})</Label>
        {tenants.length === 0 ? (
          <p className="text-sm text-gray-500">No approved tenants yet.</p>
        ) : (
          <div className="space-y-2">
            {tenants.map((b) => (
              <Card key={b.id}>
                <CardContent className="p-3 flex items-start justify-between gap-3">
                  <div>
                    <TenantInfo booking={b} />
                    <p className="text-xs text-gray-400 mt-1">
                      {b.sharing ? `${sharingLabel(b.sharing)} • ` : ""}₹{Number(b.rent).toLocaleString()}/month
                      {b.moveInDate ? ` • since ${new Date(b.moveInDate).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={removeTenant.isPending}
                    onClick={() => {
                      if (window.confirm(`Remove ${tenantName(b)} from ${property.name}? Their bed becomes available again.`)) {
                        removeTenant.mutate(b.id);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Rent payments tenants marked as paid, waiting for the owner's approval. */
export function OwnerPaymentsTab({ ownerId }: { ownerId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: payments = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/rent-payments/owner/${ownerId}`],
    enabled: !!ownerId,
  });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "paid" | "rejected" }) => {
      const res = await apiRequest("PATCH", `/api/rent-payments/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (_d, v) => {
      toast({ title: v.status === "paid" ? "Payment approved" : "Payment rejected" });
      queryClient.invalidateQueries({ queryKey: [`/api/rent-payments/owner/${ownerId}`] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sorted = [...payments].sort((a, b) => {
    const rank = (s: string) => (s === "submitted" ? 0 : s === "rejected" ? 1 : 2);
    return rank(a.status) - rank(b.status) || String(b.paymentMonth).localeCompare(String(a.paymentMonth));
  });

  if (isLoading) return <p className="text-gray-500">Loading payments…</p>;
  if (sorted.length === 0)
    return <p className="text-gray-500">No rent payments yet. When a tenant marks a month as paid it appears here for your approval.</p>;

  return (
    <div className="space-y-3">
      {sorted.map((p) => (
        <Card key={p.id}>
          <CardContent className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {p.tenantName || [p.tenantFirstName, p.tenantLastName].filter(Boolean).join(" ")} • {p.propertyName}
              </p>
              <p className="text-sm text-gray-500">
                {monthLabel(p.paymentMonth)} • ₹{Number(p.amount).toLocaleString()} • {p.paymentMethod}
              </p>
              {p.notes && <p className="text-xs text-gray-400">Note: {p.notes}</p>}
            </div>
            <div className="flex items-center gap-2">
              {p.status === "paid" && <Badge className="bg-green-600 hover:bg-green-600">Paid</Badge>}
              {p.status === "rejected" && <Badge variant="destructive">Rejected</Badge>}
              {p.status === "submitted" && (
                <>
                  <Badge variant="outline" className="text-amber-600 border-amber-300">Needs approval</Badge>
                  <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: p.id, status: "paid" })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ id: p.id, status: "rejected" })}>
                    Reject
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
