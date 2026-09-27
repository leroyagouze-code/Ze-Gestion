import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Montants : entiers en FCFA (pas de centimes), bigint en mode number.
 * Dates métier (échéances, paiements) : type SQL `date`, manipulées en chaînes "AAAA-MM-JJ".
 * Rien n'est supprimé physiquement pour les données financières : annulation + journal d'audit.
 */

const money = (name: string) => bigint(name, { mode: "number" });
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ─────────── Énumérations ─────────── */

export const orgKind = pgEnum("org_kind", ["AGENCY", "OWNER"]);
export const plan = pgEnum("plan", ["FREE", "STARTER", "PRO", "AGENCE"]);
export const memberRole = pgEnum("member_role", ["ADMIN", "MANAGER", "ACCOUNTANT", "FIELD_AGENT", "OWNER"]);
export const unitType = pgEnum("unit_type", ["CHAMBRE", "STUDIO", "APPARTEMENT", "MAISON", "BOUTIQUE", "BUREAU", "AUTRE"]);
export const unitStatus = pgEnum("unit_status", ["VACANT", "OCCUPIED", "RESERVED"]);
export const periodicity = pgEnum("periodicity", ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "YEARLY"]);
export const leaseStatus = pgEnum("lease_status", ["ACTIVE", "ENDED"]);
export const transactionType = pgEnum("transaction_type", [
  "LOYER",
  "AVANCE",
  "CAUTION",
  "CHARGE",
  "FRAIS",
  "REMBOURSEMENT",
  "AJUSTEMENT",
  "AUTRE",
]);
export const paymentMethod = pgEnum("payment_method", ["CASH", "TMONEY", "FLOOZ", "BANK", "OTHER"]);
export const paymentStatus = pgEnum("payment_status", ["VALID", "CANCELLED"]);
export const depositStatus = pgEnum("deposit_status", ["DEPOSITED", "PARTIALLY_REFUNDED", "REFUNDED", "RETAINED"]);
export const documentKind = pgEnum("document_kind", ["CONTRACT", "PROOF", "OTHER"]);
export const disputeStatus = pgEnum("dispute_status", ["OPEN", "RESOLVED", "REJECTED"]);
export const requestStatus = pgEnum("request_status", ["OPEN", "IN_PROGRESS", "CLOSED"]);
export const invitationKind = pgEnum("invitation_kind", ["TENANT", "OWNER", "MEMBER"]);
export const notificationChannel = pgEnum("notification_channel", ["WEB", "EMAIL", "SMS", "WHATSAPP"]);
export const notificationStatus = pgEnum("notification_status", ["PENDING", "SENT", "SKIPPED", "FAILED"]);

/* ─────────── Comptes et sessions ─────────── */

export const users = pgTable("users", {
  id: id(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  locale: text("locale").notNull().default("fr"),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 du jeton ; le jeton brut n'est jamais stocké
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** Espace actif : organisation (agence / propriétaire) ou null = espace locataire */
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

/* ─────────── Organisations (agence ou propriétaire indépendant) ─────────── */

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  kind: orgKind("kind").notNull(),
  plan: plan("plan").notNull().default("FREE"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  city: text("city").notNull().default("Lomé"),
  country: text("country").notNull().default("TG"),
  currency: text("currency").notNull().default("XOF"),
  createdAt: createdAt(),
});

/** Propriétaires (fiches). Pour un propriétaire indépendant, une fiche le représente lui-même. */
export const owners = pgTable(
  "owners",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    email: text("email"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("owners_org_idx").on(t.organizationId)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    /** Rôle OWNER : restreint aux biens de cette fiche propriétaire */
    ownerId: uuid("owner_id").references(() => owners.id, { onDelete: "cascade" }),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_org_user_uq").on(t.organizationId, t.userId)],
);

/* ─────────── Patrimoine ─────────── */

export const properties = pgTable(
  "properties",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").notNull().references(() => owners.id),
    name: text("name").notNull(),
    address: text("address"),
    city: text("city").notNull().default("Lomé"),
    district: text("district"),
    description: text("description"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("properties_org_idx").on(t.organizationId), index("properties_owner_idx").on(t.ownerId)],
);

export const units = pgTable(
  "units",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    label: text("label").notNull(), // numéro : A03, Chambre 2…
    type: unitType("type").notNull(),
    rentAmount: money("rent_amount").notNull(),
    periodicity: periodicity("periodicity").notNull().default("MONTHLY"),
    dueDay: integer("due_day").notNull().default(5),
    depositAmount: money("deposit_amount").notNull().default(0),
    status: unitStatus("status").notNull().default("VACANT"),
    description: text("description"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("units_org_idx").on(t.organizationId), uniqueIndex("units_property_label_uq").on(t.propertyId, t.label)],
);

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    idNumber: text("id_number"),
    notes: text("notes"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("tenants_org_idx").on(t.organizationId), index("tenants_user_idx").on(t.userId)],
);

/** Bail : relie un locataire à un logement, fige le loyer, l'échéance et la périodicité. */
export const leases = pgTable(
  "leases",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").notNull().references(() => units.id),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    rentAmount: money("rent_amount").notNull(),
    periodicity: periodicity("periodicity").notNull().default("MONTHLY"),
    dueDay: integer("due_day").notNull().default(5),
    status: leaseStatus("status").notNull().default("ACTIVE"),
    createdAt: createdAt(),
  },
  (t) => [
    index("leases_org_idx").on(t.organizationId),
    index("leases_tenant_idx").on(t.tenantId),
    // Un seul bail actif par logement
    uniqueIndex("leases_active_unit_uq").on(t.unitId).where(sql`status = 'ACTIVE'`),
  ],
);

/* ─────────── Finances ─────────── */

/** Loyers appelés : une ligne par période échue ou en cours (générée automatiquement). */
export const rentCharges = pgTable(
  "rent_charges",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    leaseId: uuid("lease_id").notNull().references(() => leases.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    dueDate: date("due_date").notNull(),
    amount: money("amount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("rent_charges_lease_period_uq").on(t.leaseId, t.periodStart), index("rent_charges_org_idx").on(t.organizationId)],
);

/** Toutes les opérations d'argent (loyer, avance, caution, frais…). Jamais supprimées : annulées. */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    leaseId: uuid("lease_id").notNull().references(() => leases.id),
    type: transactionType("type").notNull(),
    /** Toujours positif, sauf AJUSTEMENT (positif = en faveur du locataire, négatif = à sa charge) */
    amount: money("amount").notNull(),
    method: paymentMethod("method").notNull(),
    paidAt: date("paid_at").notNull(),
    reference: text("reference"), // n° de transaction Mobile Money, etc.
    note: text("note"),
    /** Réservé à une future intégration Mobile Money (identifiant fournisseur). Null = saisie manuelle. */
    providerRef: text("provider_ref"),
    status: paymentStatus("status").notNull().default("VALID"),
    cancelReason: text("cancel_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    recordedBy: uuid("recorded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("payments_org_idx").on(t.organizationId, t.paidAt), index("payments_lease_idx").on(t.leaseId)],
);

/** Répartition des paiements de loyer sur les loyers appelés (recalculée, règle FIFO). */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    paymentId: uuid("payment_id").notNull().references(() => payments.id),
    chargeId: uuid("charge_id").notNull().references(() => rentCharges.id),
    amount: money("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.paymentId, t.chargeId] }), index("allocations_charge_idx").on(t.chargeId)],
);

export const deposits = pgTable(
  "deposits",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    leaseId: uuid("lease_id").notNull().references(() => leases.id),
    paymentId: uuid("payment_id").references(() => payments.id),
    amount: money("amount").notNull(),
    depositedAt: date("deposited_at").notNull(),
    status: depositStatus("status").notNull().default("DEPOSITED"),
    refundedAmount: money("refunded_amount").notNull().default(0),
    retainedAmount: money("retained_amount").notNull().default(0),
    comment: text("comment"),
    closedAt: date("closed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("deposits_lease_idx").on(t.leaseId)],
);

export const receiptSequences = pgTable(
  "receipt_sequences",
  {
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    last: integer("last").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.year] })],
);

/** Quittances / reçus : instantané figé au moment de l'émission. */
export const receipts = pgTable(
  "receipts",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").notNull().unique().references(() => payments.id),
    leaseId: uuid("lease_id").notNull().references(() => leases.id),
    number: text("number").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    periodLabel: text("period_label").notNull(),
    amount: money("amount").notNull(),
    snapshot: jsonb("snapshot").$type<ReceiptSnapshot>().notNull(),
  },
  (t) => [uniqueIndex("receipts_org_number_uq").on(t.organizationId, t.number), index("receipts_lease_idx").on(t.leaseId)],
);

export type ReceiptSnapshot = {
  organizationName: string;
  organizationPhone: string | null;
  tenantName: string;
  tenantPhone: string;
  unitLabel: string;
  propertyName: string;
  propertyAddress: string | null;
  ownerName: string;
  type: string;
  method: string;
  paidAt: string;
  reference: string | null;
  status: "PAYÉ" | "PARTIEL";
  lines: { label: string; amount: number; full: boolean }[];
  remainingAfter: number;
};

/* ─────────── Documents, contestations, demandes ─────────── */

export const documents = pgTable(
  "documents",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    leaseId: uuid("lease_id").references(() => leases.id),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    kind: documentKind("kind").notNull(),
    title: text("title").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("documents_lease_idx").on(t.leaseId)],
);

/** « Signaler une erreur » : le locataire conteste une opération, sans pouvoir la modifier. */
export const disputes = pgTable(
  "disputes",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    leaseId: uuid("lease_id").notNull().references(() => leases.id),
    paymentId: uuid("payment_id").references(() => payments.id),
    amount: money("amount"),
    date: date("date"),
    comment: text("comment").notNull(),
    proofDocumentId: uuid("proof_document_id").references(() => documents.id),
    status: disputeStatus("status").notNull().default("OPEN"),
    response: text("response"),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("disputes_org_idx").on(t.organizationId, t.status)],
);

/** « Signaler un problème » : demandes simples du locataire (fuite, panne…). */
export const requests = pgTable(
  "requests",
  {
    id: id(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    leaseId: uuid("lease_id").notNull().references(() => leases.id),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    status: requestStatus("status").notNull().default("OPEN"),
    response: text("response"),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("requests_org_idx").on(t.organizationId, t.status)],
);

/* ─────────── Invitations, notifications, audit ─────────── */

export const invitations = pgTable("invitations", {
  id: id(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  kind: invitationKind("kind").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  ownerId: uuid("owner_id").references(() => owners.id),
  role: memberRole("role"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedBy: uuid("accepted_by").references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    channel: notificationChannel("channel").notNull().default("WEB"),
    status: notificationStatus("status").notNull().default("SENT"),
    statusDetail: text("status_detail"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    /** Évite d'envoyer deux fois le même rappel */
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt), uniqueIndex("notifications_dedupe_uq").on(t.dedupeKey, t.channel)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    /** Phrase lisible : « Paiement de 75 000 F enregistré » */
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_org_idx").on(t.organizationId, t.createdAt), index("audit_entity_idx").on(t.entityType, t.entityId)],
);
