// @ts-nocheck
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { SHARING_OPTIONS, sharingLabel, getRoomTypes } from "@shared/roomtypes";

export const emptyRoomType = (sharing = "1") => ({
  sharing,
  rent: "",
  securityDeposit: "",
  totalBeds: "",
  availableBeds: "",
});

/** Editable rows: sharing + rent + deposit + beds. Used when creating a PG or adding a room type. */
export function RoomTypesEditor({
  value,
  onChange,
  taken = [],
  title = "Room types & prices",
  allowEmpty = false,
}: {
  value: any[];
  onChange: (v: any[]) => void;
  taken?: number[]; // sharings that already exist (cannot be picked again)
  title?: string;
  allowEmpty?: boolean;
}) {
  const used = (idx: number) => [...taken, ...value.filter((_, i) => i !== idx).map((r) => Number(r.sharing))];
  const nextFree = () => SHARING_OPTIONS.find((n) => ![...taken, ...value.map((r) => Number(r.sharing))].includes(n));
  const update = (i: number, patch: any) => onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base">{title}</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={nextFree() === undefined}
          onClick={() => onChange([...value, emptyRoomType(String(nextFree()))])}
        >
          <Plus className="w-4 h-4 mr-1" /> Add room type
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        Each sharing type has its own monthly rent (per bed), deposit and number of beds.
      </p>

      {value.map((row, i) => (
        <div key={i} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end border rounded-lg p-3">
          <div className="col-span-2 md:col-span-1">
            <Label className="text-xs">Sharing</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-2 text-sm"
              value={row.sharing}
              onChange={(e) => update(i, { sharing: e.target.value })}
            >
              {SHARING_OPTIONS.map((n) => (
                <option key={n} value={n} disabled={used(i).includes(n)}>
                  {sharingLabel(n)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Rent / bed (₹)</Label>
            <Input type="number" min={1} value={row.rent} placeholder="8000" onChange={(e) => update(i, { rent: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Deposit (₹)</Label>
            <Input type="number" min={0} value={row.securityDeposit} placeholder="10000" onChange={(e) => update(i, { securityDeposit: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Total beds</Label>
            <Input type="number" min={1} value={row.totalBeds} placeholder="12" onChange={(e) => update(i, { totalBeds: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Available</Label>
            <Input type="number" min={0} value={row.availableBeds} placeholder="same as total" onChange={(e) => update(i, { availableBeds: e.target.value })} />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={!allowEmpty && value.length <= 1}
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              aria-label="Remove room type"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Read-only list of a property's room types with price and availability. */
export function RoomTypeList({ property, compact = false }: { property: any; compact?: boolean }) {
  const types = getRoomTypes(property);
  if (types.length === 0) return null;
  return (
    <div className={compact ? "flex flex-wrap gap-1.5 mt-2" : "space-y-1 mt-2"}>
      {types.map((t) =>
        compact ? (
          <span
            key={t.sharing}
            className={`text-xs rounded-full border px-2 py-0.5 ${t.availableBeds > 0 ? "text-gray-700 dark:text-gray-200" : "text-gray-400 line-through"}`}
          >
            {t.sharing} sharing • ₹{t.rent.toLocaleString()}
          </span>
        ) : (
          <div key={t.sharing} className="flex justify-between text-sm border rounded-md px-3 py-1.5">
            <span>{sharingLabel(t.sharing)}</span>
            <span>
              <b>₹{t.rent.toLocaleString()}</b>/bed • deposit ₹{t.securityDeposit.toLocaleString()} •{" "}
              <span className={t.availableBeds > 0 ? "text-green-600" : "text-red-600"}>
                {t.availableBeds}/{t.totalBeds} free
              </span>
            </span>
          </div>
        ),
      )}
    </div>
  );
}

/** "From ₹6,000" when a PG has several prices, plain price otherwise. */
export function priceLabel(property: any) {
  const types = getRoomTypes(property);
  const rent = Number(property.rent).toLocaleString();
  return types.length > 1 ? `From ₹${rent}` : `₹${rent}`;
}
