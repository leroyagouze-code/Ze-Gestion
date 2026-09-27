import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { companies, invoiceItems, invoices, saleItems, sales } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatQty } from "@/lib/money";
import { readStoredFile } from "@/lib/storage";

type Company = typeof companies.$inferSelect;

async function logoSrc(company: Company) {
  if (!company.logoUrl) return null;
  const f = await readStoredFile(company.logoUrl);
  if (!f || f.type === "application/pdf" || f.type === "image/webp") return null; // react-pdf : PNG/JPEG
  return { data: f.data, format: f.type === "image/png" ? ("png" as const) : ("jpg" as const) };
}

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#0f172a" },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#64748b" },
  th: { fontFamily: "Helvetica-Bold", color: "#ffffff", paddingVertical: 5, paddingHorizontal: 4 },
  td: { paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, textAlign: "center", fontSize: 8, color: "#64748b" },
});

const cols = { desc: "42%", qty: "10%", pu: "16%", disc: "10%", tax: "8%", total: "14%" };

export async function invoicePdf(company: Company, invoice: typeof invoices.$inferSelect, items: (typeof invoiceItems.$inferSelect)[]) {
  const logo = await logoSrc(company);
  const m = (v: number) => formatMoney(v, company.currency);
  const c = invoice.customerSnapshot;
  const color = company.brandColor || "#0f766e";
  const size = company.invoiceFormat === "A5" ? "A5" : "A4";
  const doc = (
    <Document title={`Facture ${invoice.number}`} author={company.name}>
      <Page size={size} style={s.page}>
        <View style={s.between}>
          <View style={{ maxWidth: "55%" }}>
            {logo && <Image src={logo} style={{ width: 90, maxHeight: 60, objectFit: "contain", marginBottom: 6 }} />}
            <Text style={[s.bold, { fontSize: 12 }]}>{company.name}</Text>
            {company.address && <Text>{company.address}{company.city ? `, ${company.city}` : ""}</Text>}
            {company.phone && <Text>Tél : {company.phone}</Text>}
            {company.email && <Text>{company.email}</Text>}
            {company.taxId && <Text>N° fiscal : {company.taxId}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[s.h1, { color }]}>FACTURE</Text>
            <Text style={s.bold}>{invoice.number}</Text>
            <Text>Date : {formatDate(invoice.issueDate)}</Text>
            {invoice.dueDate && <Text>Échéance : {formatDate(invoice.dueDate)}</Text>}
            {invoice.status === "cancelled" && <Text style={{ color: "#dc2626", marginTop: 4 }}>ANNULÉE</Text>}
          </View>
        </View>

        <View style={{ marginTop: 20, padding: 10, backgroundColor: "#f1f5f9", borderRadius: 4, width: "50%", alignSelf: "flex-end" }}>
          <Text style={[s.muted, { marginBottom: 2 }]}>Facturé à</Text>
          <Text style={s.bold}>{c?.name ?? "Client comptoir"}</Text>
          {c?.companyName && <Text>{c.companyName}</Text>}
          {c?.address && <Text>{c.address}</Text>}
          {c?.phone && <Text>{c.phone}</Text>}
          {c?.email && <Text>{c.email}</Text>}
          {c?.taxId && <Text>N° fiscal : {c.taxId}</Text>}
        </View>

        <View style={{ marginTop: 18 }}>
          <View style={[s.row, { backgroundColor: color }]}>
            <Text style={[s.th, { width: cols.desc }]}>Désignation</Text>
            <Text style={[s.th, { width: cols.qty, textAlign: "right" }]}>Qté</Text>
            <Text style={[s.th, { width: cols.pu, textAlign: "right" }]}>P.U. TTC</Text>
            <Text style={[s.th, { width: cols.disc, textAlign: "right" }]}>Remise</Text>
            <Text style={[s.th, { width: cols.tax, textAlign: "right" }]}>TVA</Text>
            <Text style={[s.th, { width: cols.total, textAlign: "right" }]}>Total TTC</Text>
          </View>
          {items.map((it) => (
            <View key={it.id} style={s.row} wrap={false}>
              <Text style={[s.td, { width: cols.desc }]}>{it.description}</Text>
              <Text style={[s.td, { width: cols.qty, textAlign: "right" }]}>{formatQty(it.quantity)}</Text>
              <Text style={[s.td, { width: cols.pu, textAlign: "right" }]}>{m(it.unitPrice)}</Text>
              <Text style={[s.td, { width: cols.disc, textAlign: "right" }]}>{it.discount ? m(it.discount) : "—"}</Text>
              <Text style={[s.td, { width: cols.tax, textAlign: "right" }]}>{formatQty(it.taxRate)} %</Text>
              <Text style={[s.td, { width: cols.total, textAlign: "right" }]}>{m(it.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 12, width: "45%", alignSelf: "flex-end" }}>
          <View style={s.between}><Text>Total HT</Text><Text>{m(invoice.subtotal)}</Text></View>
          <View style={s.between}><Text>TVA</Text><Text>{m(invoice.taxTotal)}</Text></View>
          {invoice.discountTotal > 0 && <View style={s.between}><Text>Remises</Text><Text>−{m(invoice.discountTotal)}</Text></View>}
          <View style={[s.between, { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: color }]}>
            <Text style={[s.bold, { fontSize: 12 }]}>Total TTC</Text>
            <Text style={[s.bold, { fontSize: 12 }]}>{m(invoice.total)}</Text>
          </View>
          <View style={s.between}><Text style={s.muted}>Payé</Text><Text style={s.muted}>{m(invoice.paidAmount)}</Text></View>
          {invoice.total - invoice.paidAmount > 0 && invoice.status !== "cancelled" && (
            <View style={s.between}><Text style={s.bold}>Reste à payer</Text><Text style={s.bold}>{m(invoice.total - invoice.paidAmount)}</Text></View>
          )}
        </View>

        <View style={{ marginTop: 18 }}>
          {invoice.paymentMethodLabel && <Text>Mode de paiement : {invoice.paymentMethodLabel}</Text>}
          {invoice.paymentTerms && <Text>Conditions de paiement : {invoice.paymentTerms}</Text>}
          {invoice.notes && <Text style={{ marginTop: 6 }}>{invoice.notes}</Text>}
          {company.bankInfo && <Text style={{ marginTop: 6 }}>Coordonnées bancaires : {company.bankInfo}</Text>}
        </View>

        <Text style={s.footer} fixed>
          {company.invoiceFooter || [company.name, company.address, company.phone, company.taxId && `N° fiscal ${company.taxId}`].filter(Boolean).join(" · ")}
        </Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}

/** Ticket de caisse 58/80 mm (hauteur calculée selon le nombre de lignes). */
export async function receiptPdf(
  company: Company,
  sale: typeof sales.$inferSelect,
  items: (typeof saleItems.$inferSelect)[],
  pays: { method: string | null; amount: number }[],
  extra: { cashier?: string | null; customer?: string | null },
) {
  const logo = await logoSrc(company);
  const m = (v: number) => formatMoney(v, company.currency);
  const width = company.receiptFormat === "58mm" ? 164 : 226; // points (1 mm ≈ 2.83 pt)
  const height = 260 + items.length * 26 + pays.length * 12 + (logo ? 50 : 0);
  const t = StyleSheet.create({ p: { padding: 8, fontSize: 7.5, fontFamily: "Helvetica" }, c: { textAlign: "center" }, line: { borderBottomWidth: 0.5, borderBottomStyle: "dashed", borderBottomColor: "#000", marginVertical: 4 } });
  const doc = (
    <Document title={`Ticket ${sale.number}`}>
      <Page size={company.receiptFormat === "A4" ? "A4" : [width, height]} style={t.p}>
        {logo && <Image src={logo} style={{ width: 60, alignSelf: "center", marginBottom: 4 }} />}
        <Text style={[t.c, s.bold, { fontSize: 10 }]}>{company.name}</Text>
        {company.address && <Text style={t.c}>{company.address}</Text>}
        {company.phone && <Text style={t.c}>Tél : {company.phone}</Text>}
        {company.taxId && <Text style={t.c}>N° fiscal : {company.taxId}</Text>}
        <View style={t.line} />
        <Text>Ticket : {sale.number}</Text>
        <Text>Date : {formatDate(sale.createdAt, true)}</Text>
        {extra.cashier && <Text>Caissier : {extra.cashier}</Text>}
        {extra.customer && <Text>Client : {extra.customer}</Text>}
        {sale.status === "cancelled" && <Text style={[t.c, s.bold]}>*** VENTE ANNULÉE ***</Text>}
        <View style={t.line} />
        {items.map((it) => (
          <View key={it.id} style={{ marginBottom: 3 }}>
            <Text>{it.name}</Text>
            <View style={s.between}>
              <Text>{formatQty(it.quantity)} × {m(it.unitPrice)}{it.discount ? ` − ${m(it.discount)}` : ""}</Text>
              <Text>{m(it.lineTotal)}</Text>
            </View>
          </View>
        ))}
        <View style={t.line} />
        <View style={s.between}><Text>Total HT</Text><Text>{m(sale.subtotal)}</Text></View>
        <View style={s.between}><Text>TVA</Text><Text>{m(sale.taxTotal)}</Text></View>
        {sale.discountTotal > 0 && <View style={s.between}><Text>Remises</Text><Text>−{m(sale.discountTotal)}</Text></View>}
        <View style={[s.between, { marginTop: 2 }]}><Text style={[s.bold, { fontSize: 10 }]}>TOTAL</Text><Text style={[s.bold, { fontSize: 10 }]}>{m(sale.total)}</Text></View>
        {pays.map((p, i) => (
          <View key={i} style={s.between}><Text>{p.method}</Text><Text>{m(p.amount)}</Text></View>
        ))}
        {sale.dueAmount > 0 && <View style={s.between}><Text style={s.bold}>Reste dû</Text><Text style={s.bold}>{m(sale.dueAmount)}</Text></View>}
        <View style={t.line} />
        <Text style={t.c}>{company.invoiceFooter || "Merci pour votre achat !"}</Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
