import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { Place } from "../search/route";

export async function POST(req: NextRequest) {
  const { places, format }: { places: Place[]; format: "csv" | "xlsx" } =
    await req.json();

  const hasCityColumn = places.some((p) => p.city);
  const rows = places.map((p) => {
    const row: Record<string, unknown> = {};
    if (hasCityColumn) row["City"] = p.city ?? "";
    row["Name"] = p.name;
    row["Address"] = p.address;
    row["Phone"] = p.phone;
    row["Website"] = p.website;
    row["Rating"] = p.rating ?? "";
    row["Reviews"] = p.reviewCount ?? "";
    row["Status"] = p.status;
    row["Google Maps"] = p.mapsUrl;
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="leads.csv"',
      },
    });
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="leads.xlsx"',
    },
  });
}
