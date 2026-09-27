"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmt = (v: number) => new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const full = (v: number) => new Intl.NumberFormat("fr-FR").format(v).replace(/ /g, " ");

export function RevenueChart({ data, currency }: { data: { date: string; revenue: number; count: number }[]; currency: string }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-slate-500">Aucune vente sur la période.</p>;
  const label = currency === "XOF" || currency === "XAF" ? "FCFA" : currency;
  const rows = data.map((d) => ({ ...d, label: d.date.split("-").reverse().slice(0, 2).join("/") }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={fmt} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} width={48} />
          <Tooltip formatter={(v) => [`${full(Number(v))} ${label}`, "Chiffre d'affaires"]} labelFormatter={(l) => `Le ${l}`} />
          <Line type="monotone" dataKey="revenue" stroke="#0f766e" strokeWidth={2.5} dot={rows.length < 40} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopProductsChart({ data }: { data: { name: string; revenue: number }[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-slate-500">Aucune vente sur la période.</p>;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: "#334155" }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v) => [full(Number(v)), "CA"]} />
          <Bar dataKey="revenue" fill="#14b8a6" radius={[0, 4, 4, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
