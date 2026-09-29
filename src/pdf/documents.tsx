import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { companies, CustomerSnapshot, invoiceItems, invoices, quoteItems, quotes, saleItems, sales } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatQty, priceBasis, shownLineTotal } from "@/lib/money";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_NAME, APP_PUBLISHER } from "@/lib/brand";
import { isLightTransparentLogo, readStoredFile } from "@/lib/storage";
import { PROFORMA_NOTICE } from "@/modules/quotes/labels";

type Company = typeof companies.$inferSelect;

let brandTile: Promise<Buffer | null> | null = null;
/** Petit logo ZE GROUP du pied de page (lu une seule fois). */
function brandLogo() {
  brandTile ??= readFile(path.join(process.cwd(), "public/brand/ze-tile.png")).catch(() => null);
  return brandTile;
}

const logoCache = new Map<string, Promise<{ data: Buffer; format: "png" | "jpg" } | null>>();

/**
 * Logo de l'entreprise pour les PDF (PNG/JPEG). Les anciens logos WebP sont convertis, et un logo
 * clair sur fond transparent est posé sur une pastille de la couleur de l'entreprise pour rester visible.
 */
function logoSrc(company: Company) {
  if (!company.logoUrl) return Promise.resolve(null);
  const key = `${company.logoUrl}|${company.brandColor}`;
  if (!logoCache.has(key)) logoCache.set(key, loadLogo(company.logoUrl, company.brandColor).catch(() => null));
  return logoCache.get(key)!;
}

async function loadLogo(url: string, brandColor: string) {
  const f = await readStoredFile(url);
  if (!f || f.type === "application/pdf") return null;
  const { default: sharp } = await import("sharp");
  if (await isLightTransparentLogo(f.data)) {
    const img = sharp(f.data).resize(600, 300, { fit: "inside", withoutEnlargement: true });
    const { width = 600, height = 300 } = await img.metadata().then(async () => (await img.clone().png().toBuffer({ resolveWithObject: true })).info);
    const pad = Math.round(Math.max(width, height) * 0.12);
    const data = await sharp({ create: { width: width + pad * 2, height: height + pad * 2, channels: 4, background: brandColor } })
      .composite([{ input: await img.png().toBuffer(), top: pad, left: pad }])
      .png()
      .toBuffer();
    return { data, format: "png" as const };
  }
  if (f.type === "image/webp") return { data: await sharp(f.data).png().toBuffer(), format: "png" as const };
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
  footer: { position: "absolute", bottom: 30, left: 36, right: 36, textAlign: "center", fontSize: 8, color: "#64748b" },
  brand: { position: "absolute", bottom: 14, left: 36, right: 36, flexDirection: "row", justifyContent: "center", alignItems: "center", fontSize: 6.5, color: "#94a3b8" },
});

const cols = { desc: "42%", qty: "10%", pu: "16%", disc: "10%", tax: "8%", total: "14%" };

/** credit : mention « Édité avec ZE Gestion », retirée pour les abonnés (essai et compte gratuit seulement). */
export type PdfOptions = { credit?: boolean };

type DocLine = typeof invoiceItems.$inferSelect | typeof quoteItems.$inferSelect;

/**
 * Mise en page commune des documents commerciaux A4/A5 (facture, facture proforma) :
 * en-tête entreprise, bloc client, lignes, totaux. Chaque document fournit son titre et ses mentions.
 */
type BillingDoc = {
  docTitle: string;
  heading: string;
  number: string;
  /** Lignes sous le numéro (dates, révision, mention d'annulation). */
  meta: React.ReactNode;
  customer: CustomerSnapshot | null | undefined;
  customerLabel: string;
  customerFallback: string;
  taxMode: string;
  items: DocLine[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  /** Lignes après le Total TTC (payé, reste à payer…). */
  totalsExtra?: React.ReactNode;
  /** Mentions sous les totaux (conditions, notes…), avant les coordonnées bancaires. */
  details: React.ReactNode;
};

async function billingDocPdf(company: Company, d: BillingDoc, opts: PdfOptions) {
  const credit = opts.credit ?? true;
  const [logo, brand] = await Promise.all([logoSrc(company), brandLogo()]);
  const m = (v: number) => formatMoney(v, company.currency);
  const c = d.customer;
  const color = company.brandColor || "#0f766e";
  const size = company.invoiceFormat === "A5" ? "A5" : "A4";
  const doc = (
    <Document title={d.docTitle} author={company.name}>
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
            <Text style={[s.h1, { color }]}>{d.heading}</Text>
            <Text style={s.bold}>{d.number}</Text>
            {d.meta}
          </View>
        </View>

        <View style={{ marginTop: 20, padding: 10, backgroundColor: "#f1f5f9", borderRadius: 4, width: "50%", alignSelf: "flex-end" }}>
          <Text style={[s.muted, { marginBottom: 2 }]}>{d.customerLabel}</Text>
          <Text style={s.bold}>{c?.name ?? d.customerFallback}</Text>
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
            <Text style={[s.th, { width: cols.pu, textAlign: "right" }]}>P.U. {priceBasis(d.taxMode)}</Text>
            <Text style={[s.th, { width: cols.disc, textAlign: "right" }]}>Remise</Text>
            <Text style={[s.th, { width: cols.tax, textAlign: "right" }]}>TVA</Text>
            <Text style={[s.th, { width: cols.total, textAlign: "right" }]}>Total {priceBasis(d.taxMode)}</Text>
          </View>
          {d.items.map((it) => (
            <View key={it.id} style={s.row} wrap={false}>
              <Text style={[s.td, { width: cols.desc }]}>{it.description}</Text>
              <Text style={[s.td, { width: cols.qty, textAlign: "right" }]}>{formatQty(it.quantity)}</Text>
              <Text style={[s.td, { width: cols.pu, textAlign: "right" }]}>{m(it.unitPrice)}</Text>
              <Text style={[s.td, { width: cols.disc, textAlign: "right" }]}>{it.discount ? m(it.discount) : "—"}</Text>
              <Text style={[s.td, { width: cols.tax, textAlign: "right" }]}>{formatQty(it.taxRate)} %</Text>
              <Text style={[s.td, { width: cols.total, textAlign: "right" }]}>{m(shownLineTotal(it, d.taxMode))}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 12, width: "45%", alignSelf: "flex-end" }}>
          <View style={s.between}><Text>Total HT</Text><Text>{m(d.subtotal)}</Text></View>
          <View style={s.between}><Text>TVA</Text><Text>{m(d.taxTotal)}</Text></View>
          {d.discountTotal > 0 && <View style={s.between}><Text>Remises</Text><Text>−{m(d.discountTotal)}</Text></View>}
          <View style={[s.between, { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: color }]}>
            <Text style={[s.bold, { fontSize: 12 }]}>Total TTC</Text>
            <Text style={[s.bold, { fontSize: 12 }]}>{m(d.total)}</Text>
          </View>
          {d.totalsExtra}
        </View>

        <View style={{ marginTop: 18 }}>
          {d.details}
          {company.bankInfo && <Text style={{ marginTop: 6 }}>Coordonnées bancaires : {company.bankInfo}</Text>}
        </View>

        <Text style={s.footer} fixed>
          {company.invoiceFooter || [company.name, company.address, company.phone, company.taxId && `N° fiscal ${company.taxId}`].filter(Boolean).join(" · ")}
        </Text>
        {credit && (
          <View style={s.brand} fixed>
            {brand && <Image src={{ data: brand, format: "png" }} style={{ width: 8, height: 8, marginRight: 3 }} />}
            <Text>Édité avec {APP_NAME} · {APP_PUBLISHER}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}

export async function invoicePdf(company: Company, invoice: typeof invoices.$inferSelect, items: (typeof invoiceItems.$inferSelect)[], opts: PdfOptions = {}) {
  const m = (v: number) => formatMoney(v, company.currency);
  return billingDocPdf(
    company,
    {
      docTitle: `Facture ${invoice.number}`,
      heading: "FACTURE",
      number: invoice.number,
      meta: (
        <>
          <Text>Date : {formatDate(invoice.issueDate)}</Text>
          {invoice.dueDate && <Text>Échéance : {formatDate(invoice.dueDate)}</Text>}
          {invoice.status === "cancelled" && <Text style={{ color: "#dc2626", marginTop: 4 }}>ANNULÉE</Text>}
        </>
      ),
      customer: invoice.customerSnapshot,
      customerLabel: "Facturé à",
      customerFallback: "Client comptoir",
      taxMode: invoice.taxMode,
      items,
      subtotal: invoice.subtotal,
      taxTotal: invoice.taxTotal,
      discountTotal: invoice.discountTotal,
      total: invoice.total,
      totalsExtra: (
        <>
          <View style={s.between}><Text style={s.muted}>Payé</Text><Text style={s.muted}>{m(invoice.paidAmount)}</Text></View>
          {invoice.total - invoice.paidAmount > 0 && invoice.status !== "cancelled" && (
            <View style={s.between}><Text style={s.bold}>Reste à payer</Text><Text style={s.bold}>{m(invoice.total - invoice.paidAmount)}</Text></View>
          )}
        </>
      ),
      details: (
        <>
          {invoice.paymentMethodLabel && <Text>Mode de paiement : {invoice.paymentMethodLabel}</Text>}
          {invoice.paymentTerms && <Text>Conditions de paiement : {invoice.paymentTerms}</Text>}
          {invoice.notes && <Text style={{ marginTop: 6 }}>{invoice.notes}</Text>}
        </>
      ),
    },
    opts,
  );
}


export async function quotePdf(company: Company, quote: typeof quotes.$inferSelect, items: (typeof quoteItems.$inferSelect)[], opts: PdfOptions = {}) {
  return billingDocPdf(
    company,
    {
      docTitle: `Facture proforma ${quote.number}`,
      heading: "FACTURE PROFORMA",
      number: quote.number,
      meta: (
        <>
          {quote.revision > 1 && <Text style={s.bold}>Révision {quote.revision}</Text>}
          <Text>Date : {formatDate(quote.issueDate)}</Text>
          <Text>Valable jusqu&apos;au : {formatDate(quote.validUntil)}</Text>
          {quote.status === "converted" && <Text style={{ color: "#059669", marginTop: 4 }}>CONVERTIE EN FACTURE</Text>}
          {quote.status === "refused" && <Text style={{ color: "#dc2626", marginTop: 4 }}>REFUSÉE</Text>}
        </>
      ),
      customer: quote.customerSnapshot,
      customerLabel: "Destinataire",
      customerFallback: "—",
      taxMode: quote.taxMode,
      items,
      subtotal: quote.subtotal,
      taxTotal: quote.taxTotal,
      discountTotal: quote.discountTotal,
      total: quote.total,
      details: (
        <>
          <Text>Offre valable jusqu&apos;au {formatDate(quote.validUntil)}.</Text>
          {quote.conditions && <Text>Conditions : {quote.conditions}</Text>}
          {quote.notes && <Text style={{ marginTop: 6 }}>{quote.notes}</Text>}
          <Text style={[s.muted, { marginTop: 8, fontSize: 8.5 }]}>{PROFORMA_NOTICE}</Text>
        </>
      ),
    },
    opts,
  );
}

/** Ticket de caisse 58/80 mm (hauteur calculée selon le nombre de lignes). */
export async function receiptPdf(
  company: Company,
  sale: typeof sales.$inferSelect,
  items: (typeof saleItems.$inferSelect)[],
  pays: { method: string | null; amount: number }[],
  extra: { cashier?: string | null; customer?: string | null },
  opts: PdfOptions = {},
) {
  const credit = opts.credit ?? true;
  const logo = await logoSrc(company);
  const m = (v: number) => formatMoney(v, company.currency);
  const width = company.receiptFormat === "58mm" ? 164 : 226; // points (1 mm ≈ 2.83 pt)
  const height = 190 + items.length * 24 + pays.length * 11 + (logo ? 50 : 0) + (extra.customer ? 10 : 0);
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
              <Text>{m(shownLineTotal(it, sale.taxMode))}</Text>
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
        {credit && <Text style={[t.c, { fontSize: 6, marginTop: 4, color: "#555" }]}>Logiciel {APP_NAME} · {APP_PUBLISHER}</Text>}
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
