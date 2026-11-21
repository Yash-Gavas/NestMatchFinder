import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CreditCard, Banknote, Smartphone } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

/** Month keys from the stay start to the current month (at least the start month). */
function monthsFor(booking: any): string[] {
  const start = new Date(booking.moveInDate || booking.approvedDate || booking.createdAt);
  if (isNaN(start.getTime())) return [];
  const first = new Date(start.getFullYear(), start.getMonth(), 1);
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = first > last ? first : last;
  const out: string[] = [];
  for (let d = new Date(first); d <= end && out.length < 36; d.setMonth(d.getMonth() + 1)) {
    out.push(monthKey(d));
  }
  return out.reverse(); // newest first
}

function StatusBadge({ payment }: { payment?: any }) {
  if (!payment) return <Badge variant="outline" className="text-red-600 border-red-300">Not paid</Badge>;
  if (payment.status === "paid") return <Badge className="bg-green-600 hover:bg-green-600">Paid ✓</Badge>;
  if (payment.status === "submitted")
    return <Badge variant="outline" className="text-amber-600 border-amber-300">Waiting for owner approval</Badge>;
  return <Badge variant="destructive">Rejected - please resubmit</Badge>;
}

export default function TenantPayments({ userId, bookings }: { userId: number; bookings: any[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<number, string>>({});

  const stays = bookings.filter((b) => b.status === "approved");

  const { data: payments = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/rent-payments/user/${userId}`],
    enabled: !!userId,
  });

  const pay = useMutation({
    mutationFn: async (v: { bookingId: number; paymentMonth: string; paymentMethod: "cash" | "online" }) => {
      const res = await apiRequest("POST", "/api/rent-payments", {
        ...v,
        notes: notes[v.bookingId] || undefined,
      });
      return res.json();
    },
    onSuccess: (_d, v) => {
      toast({
        title: "Sent to owner",
        description: `Your ${v.paymentMethod} payment for ${monthLabel(v.paymentMonth)} is waiting for the owner's approval.`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/rent-payments/user/${userId}`] });
    },
    onError: (e: any) =>
      toast({ title: "Could not record payment", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-gray-500">Loading payments…</p>;

  if (stays.length === 0) {
    return (
      <div className="text-center py-8">
        <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No active stay yet</h3>
        <p className="text-gray-600 dark:text-gray-400">
          Rent payments appear here once an owner approves your booking.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {stays.map((booking) => (
        <Card key={booking.id}>
          <CardHeader>
            <CardTitle className="text-lg">{booking.propertyName}</CardTitle>
            <p className="text-sm text-gray-500">
              Rent ₹{Number(booking.rent).toLocaleString()}/month
              {booking.securityDeposit ? ` • Deposit ₹${Number(booking.securityDeposit).toLocaleString()}` : ""}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Optional: transaction ID / note for the owner"
              value={notes[booking.id] || ""}
              onChange={(e) => setNotes({ ...notes, [booking.id]: e.target.value })}
            />
            {monthsFor(booking).map((month) => {
              const payment = payments.find((p) => p.bookingId === booking.id && p.paymentMonth === month);
              const canPay = !payment || payment.status === "rejected";
              return (
                <div
                  key={month}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border rounded-lg p-3"
                >
                  <div>
                    <p className="font-medium">{monthLabel(month)}</p>
                    <p className="text-sm text-gray-500">
                      ₹{Number(booking.rent).toLocaleString()}
                      {payment?.paymentMethod ? ` • ${payment.paymentMethod}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge payment={payment} />
                    {canPay && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pay.isPending}
                          onClick={() => pay.mutate({ bookingId: booking.id, paymentMonth: month, paymentMethod: "cash" })}
                        >
                          <Banknote className="w-4 h-4 mr-1" /> Paid cash
                        </Button>
                        <Button
                          size="sm"
                          disabled={pay.isPending}
                          onClick={() => pay.mutate({ bookingId: booking.id, paymentMonth: month, paymentMethod: "online" })}
                        >
                          <Smartphone className="w-4 h-4 mr-1" /> Paid online
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
