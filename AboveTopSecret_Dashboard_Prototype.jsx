import { useState, useEffect, useCallback } from "react";

// Mock data simulating the API response
const MOCK_DATA = [
  { account: "AboveTopSecret Main", offer: "Collagen Peptides", spend: 4823.50, revenue: 14892.30, clicks: 1247, impressions: 89420, orders: 142, newCustomers: 98, quantity1: 45, quantity3: 62, quantity5: 35, subscriptions: 89, upsellOffered: 142, upsellAccepted: 67 },
  { account: "AboveTopSecret Main", offer: "Super Greens", spend: 3215.80, revenue: 9847.60, clicks: 892, impressions: 67230, orders: 97, newCustomers: 61, quantity1: 28, quantity3: 44, quantity5: 25, subscriptions: 58, upsellOffered: 97, upsellAccepted: 41 },
  { account: "AboveTopSecret Scale", offer: "Collagen Peptides", spend: 2150.00, revenue: 7823.40, clicks: 634, impressions: 45100, orders: 78, newCustomers: 52, quantity1: 22, quantity3: 35, quantity5: 21, subscriptions: 49, upsellOffered: 78, upsellAccepted: 35 },
  { account: "AboveTopSecret Scale", offer: "Protein Blend", spend: 1890.25, revenue: 5234.90, clicks: 523, impressions: 38900, orders: 56, newCustomers: 38, quantity1: 18, quantity3: 24, quantity5: 14, subscriptions: 32, upsellOffered: 56, upsellAccepted: 22 },
  { account: "AboveTopSecret Main", offer: "Daily Multivitamin", spend: 1567.40, revenue: 4102.80, clicks: 412, impressions: 31200, orders: 43, newCustomers: 31, quantity1: 14, quantity3: 19, quantity5: 10, subscriptions: 27, upsellOffered: 43, upsellAccepted: 18 },
  { account: "AboveTopSecret Test", offer: "Collagen Peptides", spend: 890.00, revenue: 3210.50, clicks: 298, impressions: 22100, orders: 34, newCustomers: 24, quantity1: 10, quantity3: 15, quantity5: 9, subscriptions: 21, upsellOffered: 34, upsellAccepted: 16 },
];

function computeMetrics(row) {
  const roi = row.spend > 0 ? row.revenue / row.spend : 0;
  const cpa = row.orders > 0 ? row.spend / row.orders : 0;
  const aov = row.orders > 0 ? row.revenue / row.orders : 0;
  const ctr = row.impressions > 0 ? row.clicks / row.impressions : 0;
  const cpm = row.impressions > 0 ? (row.spend / row.impressions) * 1000 : 0;
  const cpc = row.clicks > 0 ? row.spend / row.clicks : 0;
  const cvr = row.clicks > 0 ? row.orders / row.clicks : 0;
  const newPct = row.orders > 0 ? row.newCustomers / row.orders : 0;
  const totalQ = row.quantity1 + row.quantity3 + row.quantity5;
  const take1 = totalQ > 0 ? row.quantity1 / totalQ : 0;
  const take3 = totalQ > 0 ? row.quantity3 / totalQ : 0;
  const take5 = totalQ > 0 ? row.quantity5 / totalQ : 0;
  const optIn = row.orders > 0 ? row.subscriptions / row.orders : 0;
  const upsellTake = row.upsellOffered > 0 ? row.upsellAccepted / row.upsellOffered : 0;
  return { ...row, roi, cpa, aov, ctr, cpm, cpc, cvr, newPct, take1, take3, take5, optIn, upsellTake, upsellDecline: 1 - upsellTake };
}

const fmt = {
  currency: (v) => v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${v.toFixed(2)}`,
  pct: (v) => `${(v * 100).toFixed(1)}%`,
  ratio: (v) => `${v.toFixed(2)}x`,
  num: (v) => v.toLocaleString(),
};

const COLUMNS = [
  { key: "offer", label: "Offer", format: (v) => v, sticky: true },
  { key: "account", label: "Account", format: (v) => v },
  { key: "spend", label: "Spend", format: fmt.currency },
  { key: "revenue", label: "Revenue", format: fmt.currency },
  { key: "roi", label: "ROI", format: fmt.ratio, color: (v) => v >= 2 ? "#10b981" : v >= 1 ? "#f59e0b" : "#ef4444" },
  { key: "cpa", label: "CPA", format: fmt.currency },
  { key: "aov", label: "AOV", format: fmt.currency },
  { key: "ctr", label: "CTR", format: fmt.pct },
  { key: "cpm", label: "CPM", format: fmt.currency },
  { key: "cpc", label: "CPC", format: fmt.currency },
  { key: "cvr", label: "CVR", format: fmt.pct },
  { key: "orders", label: "Conv.", format: fmt.num },
  { key: "newPct", label: "New %", format: fmt.pct },
  { key: "take1", label: "1-Pack", format: fmt.pct },
  { key: "take3", label: "3-Pack", format: fmt.pct },
  { key: "take5", label: "5-Pack", format: fmt.pct },
  { key: "optIn", label: "Sub %", format: fmt.pct },
  { key: "upsellTake", label: "Upsell", format: fmt.pct },
];

function SummaryCard({ label, value, sub, color }) {
  return (
    <div style={{ background: "#111827", borderRadius: 12, padding: "14px 16px", minWidth: 140, flex: "1 1 140px", border: "1px solid #1f2937" }}>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "#f9fafb", fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function MobileCard({ row, expanded, onToggle }) {
  const m = computeMetrics(row);
  const roiColor = m.roi >= 2 ? "#10b981" : m.roi >= 1 ? "#f59e0b" : "#ef4444";
  return (
    <div onClick={onToggle} style={{ background: "#111827", borderRadius: 12, padding: 16, marginBottom: 8, border: "1px solid #1f2937", cursor: "pointer", transition: "all 0.2s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb" }}>{m.offer}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{m.account}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: roiColor, fontFamily: "'JetBrains Mono', monospace" }}>{fmt.ratio(m.roi)}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>ROI</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
        <div><div style={{ fontSize: 11, color: "#6b7280" }}>Spend</div><div style={{ fontSize: 14, fontWeight: 600, color: "#f9fafb", fontFamily: "'JetBrains Mono', monospace" }}>{fmt.currency(m.spend)}</div></div>
        <div><div style={{ fontSize: 11, color: "#6b7280" }}>Revenue</div><div style={{ fontSize: 14, fontWeight: 600, color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>{fmt.currency(m.revenue)}</div></div>
        <div><div style={{ fontSize: 11, color: "#6b7280" }}>Conv.</div><div style={{ fontSize: 14, fontWeight: 600, color: "#f9fafb", fontFamily: "'JetBrains Mono', monospace" }}>{m.orders}</div></div>
        <div><div style={{ fontSize: 11, color: "#6b7280" }}>CPA</div><div style={{ fontSize: 14, fontWeight: 600, color: "#f9fafb", fontFamily: "'JetBrains Mono', monospace" }}>{fmt.currency(m.cpa)}</div></div>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1f2937", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 16px" }}>
          {[
            ["AOV", fmt.currency(m.aov)],
            ["CTR", fmt.pct(m.ctr)],
            ["CPM", fmt.currency(m.cpm)],
            ["CPC", fmt.currency(m.cpc)],
            ["CVR", fmt.pct(m.cvr)],
            ["New %", fmt.pct(m.newPct)],
            ["1-Pack", fmt.pct(m.take1)],
            ["3-Pack", fmt.pct(m.take3)],
            ["5-Pack", fmt.pct(m.take5)],
            ["Sub %", fmt.pct(m.optIn)],
            ["Upsell", fmt.pct(m.upsellTake)],
            ["Decline", fmt.pct(m.upsellDecline)],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#d1d5db", fontFamily: "'JetBrains Mono', monospace" }}>{val}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <span style={{ fontSize: 10, color: "#4b5563" }}>{expanded ? "▲ tap to collapse" : "▼ tap to expand"}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data] = useState(MOCK_DATA);
  const [filterOffer, setFilterOffer] = useState("All");
  const [filterAccount, setFilterAccount] = useState("All");
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [viewMode, setViewMode] = useState("auto");
  const [lastSync, setLastSync] = useState(new Date());
  const [sortCol, setSortCol] = useState("spend");
  const [sortDir, setSortDir] = useState("desc");

  const offers = ["All", ...new Set(data.map(d => d.offer))];
  const accounts = ["All", ...new Set(data.map(d => d.account))];

  const filtered = data
    .filter(d => filterOffer === "All" || d.offer === filterOffer)
    .filter(d => filterAccount === "All" || d.account === filterAccount)
    .map(computeMetrics)
    .sort((a, b) => {
      const aVal = a[sortCol], bVal = b[sortCol];
      if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });

  const totals = {
    spend: filtered.reduce((s, r) => s + r.spend, 0),
    revenue: filtered.reduce((s, r) => s + r.revenue, 0),
    orders: filtered.reduce((s, r) => s + r.orders, 0),
  };
  totals.roi = totals.spend > 0 ? totals.revenue / totals.spend : 0;

  useEffect(() => {
    const interval = setInterval(() => setLastSync(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSort = useCallback((col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }, [sortCol]);

  const isWide = typeof window !== "undefined" && window.innerWidth > 768;
  const showTable = viewMode === "table" || (viewMode === "auto" && isWide);

  const handleExport = () => {
    const headers = COLUMNS.map(c => c.label).join(",");
    const rows = filtered.map(r => COLUMNS.map(c => {
      const v = r[c.key];
      return typeof v === "number" ? v.toFixed(4) : `"${v}"`;
    }).join(","));
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `10fc-metrics-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ background: "#030712", minHeight: "100vh", color: "#f9fafb", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ padding: "16px 16px 0", borderBottom: "1px solid #1f2937" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
              <span style={{ color: "#3b82f6" }}>AboveTopSecret</span> Tracker
            </h1>
            <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "'JetBrains Mono', monospace" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} • synced {lastSync.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setViewMode(v => v === "table" ? "cards" : "table")}
              style={{ background: "#1f2937", border: "none", color: "#9ca3af", padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
              {showTable ? "📱 Cards" : "📊 Table"}
            </button>
            <button onClick={handleExport}
              style={{ background: "#1f2937", border: "none", color: "#9ca3af", padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
              ⬇ CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <select value={filterOffer} onChange={e => setFilterOffer(e.target.value)}
            style={{ background: "#111827", color: "#d1d5db", border: "1px solid #374151", borderRadius: 8, padding: "8px 12px", fontSize: 13, flex: 1, minWidth: 120, appearance: "none", WebkitAppearance: "none" }}>
            {offers.map(o => <option key={o} value={o}>{o === "All" ? "All Offers" : o}</option>)}
          </select>
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
            style={{ background: "#111827", color: "#d1d5db", border: "1px solid #374151", borderRadius: 8, padding: "8px 12px", fontSize: 13, flex: 1, minWidth: 120, appearance: "none", WebkitAppearance: "none" }}>
            {accounts.map(a => <option key={a} value={a}>{a === "All" ? "All Accounts" : a}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ padding: "12px 16px", display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <SummaryCard label="Spend" value={fmt.currency(totals.spend)} />
        <SummaryCard label="Revenue" value={fmt.currency(totals.revenue)} color="#10b981" />
        <SummaryCard label="ROI" value={fmt.ratio(totals.roi)} color={totals.roi >= 2 ? "#10b981" : totals.roi >= 1 ? "#f59e0b" : "#ef4444"} />
        <SummaryCard label="Orders" value={totals.orders} />
      </div>

      {/* Data View */}
      <div style={{ padding: "0 16px 80px" }}>
        {showTable ? (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 12, border: "1px solid #1f2937" }}>
            <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <th key={col.key} onClick={() => handleSort(col.key)}
                      style={{
                        padding: "10px 12px", textAlign: "left", background: "#111827", color: "#9ca3af",
                        fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5,
                        cursor: "pointer", whiteSpace: "nowrap", borderBottom: "1px solid #1f2937",
                        position: col.sticky ? "sticky" : "static", left: col.sticky ? 0 : "auto",
                        zIndex: col.sticky ? 2 : 1, fontFamily: "'JetBrains Mono', monospace",
                        userSelect: "none",
                      }}>
                      {col.label} {sortCol === col.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#030712" : "#0a0f1a" }}>
                    {COLUMNS.map(col => (
                      <td key={col.key} style={{
                        padding: "10px 12px", whiteSpace: "nowrap", borderBottom: "1px solid #111827",
                        color: col.color ? col.color(row[col.key]) : "#d1d5db",
                        fontWeight: col.key === "offer" ? 600 : 400,
                        fontFamily: typeof row[col.key] === "number" ? "'JetBrains Mono', monospace" : "inherit",
                        position: col.sticky ? "sticky" : "static", left: col.sticky ? 0 : "auto",
                        background: col.sticky ? (i % 2 === 0 ? "#030712" : "#0a0f1a") : "transparent",
                        zIndex: col.sticky ? 1 : 0,
                      }}>
                        {col.format(row[col.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {filtered.map((row, i) => (
              <MobileCard key={i} row={row} expanded={expandedIdx === i} onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, #030712 30%)", padding: "20px 16px 12px", textAlign: "center" }}>
        <div style={{ fontSize: 10, color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}>
          AboveTopSecret PROPRIETARY • {filtered.length} rows • auto-refresh 60s
        </div>
      </div>
    </div>
  );
}
