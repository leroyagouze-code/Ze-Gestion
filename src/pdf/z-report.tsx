import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { CashSessionSummary, companies } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { APP_NAME } from "@/lib/brand";

type Company = typeof companies.$inferSelect;

export type ZReportSession = {
  registerName: string;
  storeName: string;
  openedByName: string | null;
  closedByName: string | null;
  openedAt: Date;
  closedAt: Date | null;
  openingFloat: number;
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
  forced: boolean;
  closingNotes: string | null;
  summary: CashSessionSummary;
};

/** Rapport Z (clôture de caisse) au format ticket 58/80 mm, ou A4 si l'entreprise imprime ses tickets en A4. */
export async function zReportPdf(company: Company, s: ZReportSession) {
  const m = (v: number) => formatMoney(v, company.currency);
  const sum = s.summary;
  const width = company.receiptFormat === "58mm" ? 164 : 226;
  const height = 295 + sum.byMethod.length * 11 + (s.closingNotes ? 20 : 0);
  const t = StyleSheet.create({
    p: { padding: 8, fontSize: 7.5, fontFamily: "Helvetica" },
    c: { textAlign: "center" },
    b: { fontFamily: "Helvetica-Bold" },
    row: { flexDirection: "row", justifyContent: "space-between" },
    line: { borderBottomWidth: 0.5, borderBottomStyle: "dashed", borderBottomColor: "#000", marginVertical: 4 },
  });
  const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
    <View style={t.row}>
      <Text style={bold ? t.b : {}}>{label}</Text>
      <Text style={bold ? t.b : {}}>{value}</Text>
    </View>
  );
  const diff = s.difference ?? 0;
  const doc = (
    <Document title={`Rapport Z ${s.registerName}`}>
      <Page size={company.receiptFormat === "A4" ? "A4" : [width, height]} style={t.p}>
        <Text style={[t.c, t.b, { fontSize: 10 }]}>{company.name}</Text>
        <Text style={t.c}>{s.storeName}</Text>
        <Text style={[t.c, t.b, { fontSize: 9, marginTop: 4 }]}>RAPPORT Z · CLÔTURE DE CAISSE</Text>
        <View style={t.line} />
        <Row label="Caisse" value={s.registerName} />
        <Row label="Caissier" value={s.openedByName ?? "—"} />
        <Row label="Ouverture" value={formatDate(s.openedAt, true)} />
        <Row label="Clôture" value={s.closedAt ? formatDate(s.closedAt, true) : "—"} />
        {(s.forced || (s.closedByName && s.closedByName !== s.openedByName)) && <Row label="Clôturée par" value={`${s.closedByName ?? "—"}${s.forced ? " (forcée)" : ""}`} />}
        <View style={t.line} />
        <Row label="Ventes" value={String(sum.salesCount)} />
        <Row label="Chiffre d'affaires TTC" value={m(sum.salesTotal)} bold />
        <Row label="Panier moyen" value={m(sum.salesCount ? sum.salesTotal / sum.salesCount : 0)} />
        <Row label="Remises accordées" value={m(sum.discountTotal)} />
        <Row label={`Annulations (${sum.cancelledCount})`} value={m(sum.cancelledTotal)} />
        <Row label="Ventes à crédit" value={m(sum.creditTotal)} />
        <View style={t.line} />
        <Text style={[t.b, { marginBottom: 2 }]}>Par moyen de paiement</Text>
        {sum.byMethod.length === 0 && <Text>Aucun encaissement</Text>}
        {sum.byMethod.map((x) => (
          <Row key={x.method} label={`${x.method} (${x.count})`} value={m(x.total)} />
        ))}
        <View style={t.line} />
        <Row label="Fond de caisse" value={m(s.openingFloat)} />
        <Row label="Espèces encaissées" value={m(sum.cashIn)} />
        <Row label="Espèces attendues" value={m(s.expectedCash)} bold />
        <Row label="Espèces comptées" value={s.countedCash == null ? "—" : m(s.countedCash)} bold />
        <Row label="Écart" value={diff === 0 ? "0 (juste)" : `${diff > 0 ? "+" : "-"}${m(Math.abs(diff))} (${diff > 0 ? "excédent" : "manque"})`} bold />
        {s.closingNotes && <Text style={{ marginTop: 3 }}>Note : {s.closingNotes}</Text>}
        <View style={t.line} />
        <Text style={{ marginTop: 10 }}>Signature caissier :</Text>
        <Text style={{ marginTop: 14 }}>Signature responsable :</Text>
        <Text style={[t.c, { fontSize: 6, marginTop: 10, color: "#555" }]}>{APP_NAME}</Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
