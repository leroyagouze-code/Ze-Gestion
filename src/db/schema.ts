import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  date,
  index,
  uniqueIndex,
  primaryKey,
  pgEnum,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const companyId = () =>
  uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 18, scale: 2, mode: "number" });
const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });

/* ───────────────────────── Plateforme (tables globales, sans RLS) ───────────────────────── */

export const companyStatus = pgEnum("company_status", ["active", "suspended"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "suspended",
  "canceled",
]);

export type PlanLimits = {
  maxUsers: number | null;
  maxProducts: number | null;
  maxStores: number | null;
  features: string[];
};

export const plans = pgTable("plans", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  monthlyPrice: money("monthly_price").notNull().default(0),
  currency: text("currency").notNull().default("XOF"),
  limits: jsonb("limits").$type<PlanLimits>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  ownerName: text("owner_name").notNull(),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  email: text("email").notNull(),
  address: text("address"),
  city: text("city"),
  country: text("country").notNull().default("TG"),
  currency: text("currency").notNull().default("XOF"),
  taxId: text("tax_id"),
  logoUrl: text("logo_url"),
  billingAddress: text("billing_address"),
  extraInfo: text("extra_info"),
  brandColor: text("brand_color").notNull().default("#0f766e"),
  bankInfo: text("bank_info"),
  invoiceNotes: text("invoice_notes"),
  invoiceFooter: text("invoice_footer"),
  invoiceFormat: text("invoice_format").notNull().default("A4"),
  receiptFormat: text("receipt_format").notNull().default("80mm"),
  allowNegativeStock: boolean("allow_negative_stock").notNull().default(false),
  locale: text("locale").notNull().default("fr"),
  timezone: text("timezone").notNull().default("Africa/Lome"),
  /** TVA ligne par ligne (prix TTC) ou sur le total HT (prix HT) : voir TaxMode dans src/lib/money.ts. */
  taxMode: text("tax_mode").notNull().default("line"),
  /** Modules masqués du menu (voir src/lib/modules.ts). Vide = tout est affiché. */
  hiddenModules: text("hidden_modules").array().notNull().default(sql`'{}'::text[]`),
  status: companyStatus("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const subscriptions = pgTable("subscriptions", {
  id: id(),
  companyId: companyId(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id),
  status: subscriptionStatus("status").notNull().default("trialing"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  /** Accès complet offert par la plateforme : ni date de fin, ni limite de formule. */
  unlimited: boolean("unlimited").notNull().default(false),
  notes: text("notes"),
  /** Logiciel de bureau : code de licence signé saisi sur ce poste (revérifié à chaque chargement). */
  licenseCode: text("license_code"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Paiements d'abonnement reçus par la plateforme (TMoney, Flooz, espèces…), saisis par le super admin. */
/** Codes de licence du logiciel de bureau générés par le super admin (registre). */
export const licenseIssues = pgTable("license_issues", {
  id: id(),
  installId: text("install_id").notNull(),
  plan: text("plan").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  customer: text("customer"),
  code: text("code").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/**
 * Installations signalées par le logiciel Windows et les postes en ligne (hors données des clients) :
 * table de la plateforme, lue seulement par le super admin.
 */
export const appInstalls = pgTable("app_installs", {
  id: id(),
  installId: text("install_id").notNull().unique(),
  edition: text("edition").notNull(), // "desktop" | "web"
  version: text("version"),
  os: text("os"),
  locale: text("locale"),
  timezone: text("timezone"),
  country: text("country"),
  companyName: text("company_name"),
  licensed: boolean("licensed").notNull().default(false),
  pings: integer("pings").notNull().default(1),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionPayments = pgTable(
  "subscription_payments",
  {
    id: id(),
    companyId: companyId(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    amount: money("amount").notNull(),
    currency: text("currency").notNull().default("XOF"),
    method: text("method").notNull(),
    reference: text("reference"),
    months: integer("months").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("subscription_payments_company_idx").on(t.companyId, t.createdAt)],
);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // SHA-256 du jeton, jamais le jeton en clair
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
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

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_company_created_idx").on(t.companyId, t.createdAt.desc())],
);

/* ───────────────────────── Entreprise (RLS par company_id) ───────────────────────── */

export const roles = pgTable(
  "roles",
  {
    id: id(),
    companyId: companyId(),
    name: text("name").notNull(),
    permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("roles_company_name_uq").on(t.companyId, t.name)],
);

export const stores = pgTable("stores", {
  id: id(),
  companyId: companyId(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("store"), // store | warehouse
  address: text("address"),
  phone: text("phone"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    companyId: companyId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    isOwner: boolean("is_owner").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("memberships_company_user_uq").on(t.companyId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const taxes = pgTable("taxes", {
  id: id(),
  companyId: companyId(),
  name: text("name").notNull(),
  rate: numeric("rate", { precision: 6, scale: 3, mode: "number" }).notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const paymentMethodType = pgEnum("payment_method_type", [
  "cash",
  "mobile_money",
  "card",
  "transfer",
  "credit",
  "other",
]);

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: id(),
    companyId: companyId(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    type: paymentMethodType("type").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("payment_methods_company_code_uq").on(t.companyId, t.code)],
);

export const documentSequences = pgTable(
  "document_sequences",
  {
    companyId: companyId(),
    docType: text("doc_type").notNull(), // invoice | sale | quote | delivery | purchase_order
    prefix: text("prefix").notNull(),
    pattern: text("pattern").notNull().default("{PREFIX}-{YYYY}-{SEQ}"),
    padding: integer("padding").notNull().default(6),
    nextNumber: integer("next_number").notNull().default(1),
    resetYearly: boolean("reset_yearly").notNull().default(true),
    currentYear: integer("current_year").notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.docType] })],
);

export const categories = pgTable(
  "categories",
  {
    id: id(),
    companyId: companyId(),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("categories_company_name_parent_uq").on(t.companyId, t.parentId, t.name)],
);

export const brands = pgTable(
  "brands",
  {
    id: id(),
    companyId: companyId(),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("brands_company_name_uq").on(t.companyId, t.name)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    companyId: companyId(),
    name: text("name").notNull(),
    companyName: text("company_name"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    notes: text("notes"),
    balanceDue: money("balance_due").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("suppliers_company_name_idx").on(t.companyId, t.name)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    companyId: companyId(),
    name: text("name").notNull(),
    reference: text("reference"),
    sku: text("sku"),
    barcode: text("barcode"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    description: text("description"),
    imageUrl: text("image_url"),
    purchasePrice: money("purchase_price").notNull().default(0),
    salePrice: money("sale_price").notNull().default(0),
    promoPrice: money("promo_price"),
    taxId: uuid("tax_id").references(() => taxes.id, { onDelete: "set null" }),
    minStock: qty("min_stock").notNull().default(0),
    unit: text("unit").notNull().default("pièce"),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    expiryDate: date("expiry_date"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("products_company_sku_uq").on(t.companyId, t.sku),
    index("products_company_barcode_idx").on(t.companyId, t.barcode),
    index("products_company_reference_idx").on(t.companyId, t.reference),
    index("products_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

export const stockLevels = pgTable(
  "stock_levels",
  {
    companyId: companyId(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: qty("quantity").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.storeId, t.productId] }),
    index("stock_levels_company_product_idx").on(t.companyId, t.productId),
  ],
);

export const stockMovementType = pgEnum("stock_movement_type", [
  "in",
  "out",
  "adjustment",
  "inventory",
  "transfer_in",
  "transfer_out",
  "sale",
  "sale_cancel",
  "customer_return",
  "purchase_receipt",
  "supplier_return",
]);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    companyId: companyId(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    type: stockMovementType("type").notNull(),
    quantity: qty("quantity").notNull(), // signée : + entrée, - sortie
    quantityAfter: qty("quantity_after").notNull(),
    unitCost: money("unit_cost"),
    reason: text("reason"),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_movements_company_created_idx").on(t.companyId, t.createdAt.desc()),
    index("stock_movements_product_idx").on(t.companyId, t.productId, t.createdAt.desc()),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    companyId: companyId(),
    name: text("name").notNull(),
    companyName: text("company_name"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    address: text("address"),
    taxId: text("tax_id"),
    notes: text("notes"),
    totalSpent: money("total_spent").notNull().default(0),
    balanceDue: money("balance_due").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("customers_company_name_idx").on(t.companyId, t.name),
    index("customers_company_phone_idx").on(t.companyId, t.phone),
  ],
);

export const saleStatus = pgEnum("sale_status", ["completed", "cancelled"]);

export const sales = pgTable(
  "sales",
  {
    id: id(),
    companyId: companyId(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    number: text("number").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    status: saleStatus("status").notNull().default("completed"),
    subtotal: money("subtotal").notNull(), // HT après remises lignes
    discountTotal: money("discount_total").notNull().default(0),
    taxTotal: money("tax_total").notNull().default(0),
    total: money("total").notNull(), // TTC
    /** Mode de TVA au moment de la vente : "line" = prix unitaires TTC, "total" = prix unitaires HT. */
    taxMode: text("tax_mode").notNull().default("line"),
    costTotal: money("cost_total").notNull().default(0),
    paidAmount: money("paid_amount").notNull().default(0),
    dueAmount: money("due_amount").notNull().default(0),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sales_company_number_uq").on(t.companyId, t.number),
    index("sales_company_created_idx").on(t.companyId, t.createdAt.desc()),
    index("sales_company_customer_idx").on(t.companyId, t.customerId),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: id(),
    companyId: companyId(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    quantity: qty("quantity").notNull(),
    unitPrice: money("unit_price").notNull(), // TTC
    discount: money("discount").notNull().default(0),
    taxRate: numeric("tax_rate", { precision: 6, scale: 3, mode: "number" }).notNull().default(0),
    taxAmount: money("tax_amount").notNull().default(0),
    lineTotal: money("line_total").notNull(), // TTC
    unitCost: money("unit_cost").notNull().default(0),
  },
  (t) => [index("sale_items_sale_idx").on(t.saleId), index("sale_items_product_idx").on(t.companyId, t.productId)],
);

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "cancelled",
]);

export type CustomerSnapshot = {
  name: string;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxId?: string | null;
};

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    companyId: companyId(),
    number: text("number").notNull(),
    saleId: uuid("sale_id").references(() => sales.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    customerSnapshot: jsonb("customer_snapshot").$type<CustomerSnapshot>(),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date"),
    status: invoiceStatus("status").notNull().default("issued"),
    subtotal: money("subtotal").notNull(),
    discountTotal: money("discount_total").notNull().default(0),
    taxTotal: money("tax_total").notNull().default(0),
    total: money("total").notNull(),
    /** Mode de TVA au moment de la facture : "line" = prix unitaires TTC, "total" = prix unitaires HT. */
    taxMode: text("tax_mode").notNull().default("line"),
    paidAmount: money("paid_amount").notNull().default(0),
    paymentMethodLabel: text("payment_method_label"),
    paymentTerms: text("payment_terms"),
    notes: text("notes"),
    publicToken: text("public_token").notNull().unique(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invoices_company_number_uq").on(t.companyId, t.number),
    index("invoices_company_created_idx").on(t.companyId, t.createdAt.desc()),
    index("invoices_company_customer_idx").on(t.companyId, t.customerId),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: id(),
    companyId: companyId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: qty("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    discount: money("discount").notNull().default(0),
    taxRate: numeric("tax_rate", { precision: 6, scale: 3, mode: "number" }).notNull().default(0),
    taxAmount: money("tax_amount").notNull().default(0),
    lineTotal: money("line_total").notNull(),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    companyId: companyId(),
    saleId: uuid("sale_id").references(() => sales.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id),
    amount: money("amount").notNull(),
    reference: text("reference"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_company_created_idx").on(t.companyId, t.createdAt.desc()),
    index("payments_sale_idx").on(t.saleId),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    companyId: companyId(),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    category: text("category").notNull(),
    amount: money("amount").notNull(),
    spentOn: date("spent_on").notNull(),
    description: text("description"),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id, { onDelete: "set null" }),
    attachmentUrl: text("attachment_url"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_company_date_idx").on(t.companyId, t.spentOn.desc())],
);

/** Tables soumises à la Row Level Security (colonne company_id obligatoire). */
export const TENANT_TABLES = [
  "roles",
  "stores",
  "memberships",
  "taxes",
  "payment_methods",
  "document_sequences",
  "categories",
  "brands",
  "suppliers",
  "products",
  "stock_levels",
  "stock_movements",
  "customers",
  "sales",
  "sale_items",
  "invoices",
  "invoice_items",
  "payments",
  "expenses",
] as const;
