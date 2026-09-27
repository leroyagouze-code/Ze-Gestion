import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReceiptSnapshot } from "@/db/schema";
import { longDate } from "@/modules/finance/dates";
import { METHOD_LABELS, TYPE_LABELS, type PaymentMethod } from "@/modules/finance/labels";
import type { TransactionType } from "@/modules/finance/ledger";
import { formatMoneyPlain } from "@/lib/money";
import { formatPhone } from "@/lib/phone";

const GREEN = "#0f5f3e";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", color: "#16211c" },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", color: GREEN },
  muted: { color: "#57534e" },
  bold: { fontFamily: "Helvetica-Bold" },
  title: { marginTop: 24, fontSize: 16, fontFamily: "Helvetica-Bold", textAlign: "center", letterSpacing: 1 },
  box: { marginTop: 18, borderWidth: 1, borderColor: "#e7e0cf", borderRadius: 6 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f3efe5", paddingVertical: 7, paddingHorizontal: 10 },
  label: { width: "38%", color: "#57534e" },
  value: { width: "62%", fontFamily: "Helvetica-Bold" },
  stamp: { marginTop: 18, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 24, borderWidth: 2, borderRadius: 6, fontSize: 16, fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 28, left: 40, right: 40, fontSize: 8.5, color: "#78716c", textAlign: "center" },
});

export async function receiptPdf(r: { number: string; periodLabel: string; amount: number; issuedAt: Date; snapshot: ReceiptSnapshot; cancelled: boolean }) {
  const snap = r.snapshot;
  const isRent = snap.type === "LOYER" || snap.type === "AVANCE";
  const status = r.cancelled ? "ANNULÉE" : snap.status;
  const stampColor = r.cancelled ? "#b91c1c" : snap.status === "PAYÉ" ? GREEN : "#b45309";
  const rows: [string, string][] = [
    ["Reçu N°", r.number],
    ["Locataire", snap.tenantName],
    ["Logement", `${snap.unitLabel} — ${snap.propertyName}`],
    ...(snap.propertyAddress ? ([["Adresse", snap.propertyAddress]] as [string, string][]) : []),
    ["Propriétaire", snap.ownerName],
    ["Période", r.periodLabel],
    ["Montant", formatMoneyPlain(r.amount)],
    ["Mode de paiement", METHOD_LABELS[snap.method as PaymentMethod] ?? snap.method],
    ...(snap.reference ? ([["Référence", snap.reference]] as [string, string][]) : []),
    ["Date", longDate(snap.paidAt)],
  ];
  const doc = (
    <Document title={`Quittance ${r.number}`} author="ZE LOYER">
      <Page size="A5" style={s.page}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text style={s.brand}>ZE LOYER</Text>
            <Text style={s.muted}>La gestion locative, simplement.</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.bold}>{snap.organizationName}</Text>
            {snap.organizationPhone && <Text style={s.muted}>{formatPhone(snap.organizationPhone)}</Text>}
          </View>
        </View>

        <Text style={s.title}>{isRent ? "QUITTANCE DE LOYER" : `REÇU — ${(TYPE_LABELS[snap.type as TransactionType] ?? snap.type).toUpperCase()}`}</Text>

        <View style={s.box}>
          {rows.map(([k, v]) => (
            <View key={k} style={s.row}>
              <Text style={s.label}>{k}</Text>
              <Text style={s.value}>{v}</Text>
            </View>
          ))}
        </View>

        {isRent && snap.lines.length > 1 && (
          <View style={{ marginTop: 12 }}>
            <Text style={[s.bold, { marginBottom: 4 }]}>Détail par mois</Text>
            {snap.lines.map((l) => (
              <View key={l.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
                <Text>{l.label}</Text>
                <Text>
                  {formatMoneyPlain(l.amount)}
                  {l.full ? "" : " (partiel)"}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={[s.stamp, { color: stampColor, borderColor: stampColor }]}>Statut : {status}</Text>
        {isRent && snap.remainingAfter > 0 && !r.cancelled && (
          <Text style={{ marginTop: 8, textAlign: "center", color: "#b45309" }}>Reste à payer à la date de ce reçu : {formatMoneyPlain(snap.remainingAfter)}</Text>
        )}

        <Text style={s.footer}>
          Quittance émise le {r.issuedAt.toLocaleDateString("fr-FR", { timeZone: "Africa/Lome" })} via ZE LOYER. Ce document atteste du paiement enregistré par {snap.organizationName}.
        </Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
