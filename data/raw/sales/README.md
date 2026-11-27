# `brasaland_sales.csv`

Historical monthly sales, provided by the user as a local file
(`brasaland_sales (1).csv` on their Desktop) — not sourced from this
repo's Supabase instance, a POS integration, or any other in-repo system.
This repo currently has no sales/transactions domain (only inventory
in/outbound, menu items, and telemetry events — see
`data/pipelines/sales-profit-forecast/README.md` for the gap analysis),
so this CSV is, for now, the only sales data available.

- **Rows**: 120, one per calendar month, 2016-01 through 2025-12. No gaps,
  no duplicate months (validated by `data_prep.load_sales_data`).
- **Columns**: `month` (date, first of month), `revenue_usd`,
  `covers_served` (meals served), `avg_ticket_usd` (`revenue_usd /
  covers_served`, not independent), `market` — constant (`"consolidated"`)
  across every row in the current export; not a per-location breakdown.
- **PII**: none — purely aggregated monthly totals, no customer, employee,
  or transaction-level data. Safe to commit as-is.
- **Consumer**: `data/pipelines/sales-profit-forecast/` (revenue
  forecasting pipeline).
