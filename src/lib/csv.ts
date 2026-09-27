import Papa from "papaparse";

/** CSV UTF-8 avec BOM et séparateur « ; » : s'ouvre directement dans Excel en français. */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]) {
  const csv = Papa.unparse(rows, { delimiter: ";", columns, escapeFormulae: true });
  return "﻿" + csv;
}

export function csvResponse(body: string, filename: string) {
  return new Response(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
