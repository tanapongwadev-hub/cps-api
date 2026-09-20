# Material Receiving & Disbursement Traceability

Added 2026-09-20. This document records the design decisions behind the
traceability ledger deepening and the `material-traceability` reporting
module, for anyone (human or agent) picking this area up later.

Original Thai specification: see the handoff at
`admin-dashboard/docs/handoffs/2026-09-20-material-traceability-claude.md`
(admin-dashboard repo) for the full requirements text and acceptance
criteria this work was built against.

## What changed, and why

The project already had a real operational write path for material
receiving and disbursement (`materials-receiving`, `materials-disbursement`
modules) and a `stock_transactions` table that recorded *that stock moved*,
but not enough to answer "why" — no trace id tying a receiving's MAIN QR,
its SUB QRs, and the resulting stock movements together; no audit trail of
who changed what; no per-package movement rows (a receiving's confirm wrote
one aggregate `RECEIVE` row, not one per box); and cancellation used a
generic `ADJUST` type that didn't distinguish "reversal of an original
transaction" from "physical stock count correction."

Per the spec's own instruction ("ห้ามสร้าง duplicate table หรือ duplicate
business logic หากโครงสร้างเดิมสามารถขยายได้" — don't create a duplicate
table or duplicate business logic if the existing structure can be
extended), everything here is an **extension** of the existing schema and
services, not a parallel system:

- `stock_transactions` gained `transaction_no`, `trace_id`, `main_qr_id`,
  `sub_qr_id`, `unit_id`, `department_id`, `production_order`,
  `reference_no`, `source_location_id`, `destination_location_id`, `reason`,
  and its `transaction_type` check constraint widened from
  `RECEIVE/ISSUE/ADJUST` to the full
  `RECEIVE/ISSUE/RETURN/ADJUST_IN/ADJUST_OUT/TRANSFER_IN/TRANSFER_OUT/CANCEL`
  set. It remains the single ledger table and the traceability module's only
  source of truth for "what happened to stock."
- `material_receivings` and `materials_disbursements` both gained a unique
  `trace_id`. `materials_disbursements` also gained `department_id`,
  `production_order`, `reference_no`, `requested_by`, `approved_by` —
  destination/reference metadata the spec's filters and reports need.
- `material_disbursement_packages` (the FIFO allocation join table) gained
  `fifo_order`, `reversed_at`, `reversed_by` — so a cancelled allocation is
  marked reversed, never deleted, and its original draw order is preserved.
- `material_receiving_packages`' status constraint widened to include
  `partial` and `cancelled` alongside `pending/in_stock/issued/damaged/
  returned`, and its parent FK changed from `ON DELETE CASCADE` to
  `ON DELETE RESTRICT` — a receiving can no longer accidentally cascade-
  delete its packages' history. **Note**: `partial` was already being
  written by `materials-disbursement.service.ts`'s FIFO logic before this
  migration, but the live DB constraint had never actually been updated to
  allow it (confirmed by querying the deployed constraint directly) — so a
  partially-consumed package was silently violating this check in
  production. This migration is what actually makes that write legal, not
  just a preparatory step for new traceability work.
- `iam.audit_logs` gained `trace_id`, `request_id`, `reason` so an audit
  entry can be correlated back to the same business transaction as its
  ledger rows.
- One new shared write seam, `src/common/stock-ledger.ts`
  (`createTraceId`, `recordStockMovement`, `recordAuditEvent`) — both
  `materials-receiving.service.ts` and `materials-disbursement.service.ts`
  write through this, not through a direct repository injection, so there
  is exactly one place that knows how to shape a ledger row or an audit
  event. Neither service injects `StockTransaction`'s repository directly
  anymore (removed as dead code once the ledger seam replaced it).

No new "QR" entity was created — a MAIN QR *is* a `MaterialReceiving` row
and a SUB QR *is* a `MaterialReceivingPackage` row. They already carry the
real QR image/payload data; the traceability module treats them as the
MAIN/SUB QR hierarchy directly rather than inventing a parallel `qr_codes`
table.

## Operational-flow changes

- **Receiving confirm** now writes one `RECEIVE` `stock_transactions` row
  **per package** (previously one aggregate row per document), each with
  `main_qr_id` = the receiving id and `sub_qr_id` = the package id. The sum
  of package quantities is asserted to equal the receiving's converted
  stock quantity before any row is written (a pre-existing check, kept).
- **Receiving cancel** is blocked if any package has already been partially
  or fully issued (a pre-existing rule, kept), and on a legal cancel it now
  writes one `CANCEL` reversal row per package (was: one `ADJUST` row for
  the whole document) and sets every package's status to `cancelled`
  (previously packages were left `in_stock`/`issued` after a document-level
  cancel, which was itself a latent bug).
- **Receiving `remove`** (delete a draft) no longer hard-deletes the row —
  it sets `status: 'cancelled'`, `cancelReason: 'Draft voided'`, and cancels
  its packages too, with a `DELETE`-action audit event. This matches §10 of
  the spec ("ห้าม Hard Delete... หากยกเลิกรายการให้ใช้ status = CANCELLED").
- **Disbursement confirm** already did real FIFO (oldest `receiveDate`
  first); it now additionally writes `fifo_order` on each allocation row and
  routes its stock-movement write through the shared ledger seam with
  `main_qr_id`/`sub_qr_id`/`department_id`/`production_order`/
  `reference_no` populated.
- **Disbursement cancel** restores each drawn package's `remaining_quantity`
  (clamped to its original `quantity`), writes one `CANCEL` reversal row per
  package, and — this was a real bug found and fixed during this work —
  also decrements the disbursement item's own `disbursed_quantity` by the
  restored amount, so a cancelled disbursement's item no longer keeps
  reporting its pre-cancellation quantity. The original allocation
  (`material_disbursement_packages`) row is kept and marked
  `reversed_at`/`reversed_by`, never deleted, so `GET
  /material-traceability/disbursements/:id` can still show "this was issued,
  then reversed" rather than silently losing the fact it ever happened.
- **Disbursement `remove`** is likewise a soft cancel now, not a hard
  delete, and requires the caller's user id (both the receiving and
  disbursement controllers' `DELETE` route now take `@CurrentUser('id')`).

### A real bug fixed: cancel-audit `before.status`

`MaterialsDisbursementService#cancel` used to mutate `disbursement.status =
'cancelled'` **before** building the audit event's `before` snapshot, so
`before.status` always read back as `'confirmed'` — even for a draft being
cancelled — because the check `disbursement.status === 'cancelled' ?
'confirmed' : 'draft'` ran *after* the mutation had already happened. Fixed
by capturing `const previousStatus = disbursement.status` before any
mutation. Covered by
`materials-disbursement.service.spec.ts`'s "cancelling a draft records
before.status as draft, not confirmed" test.

### A domain decision: draft-receiving package delete/recreate

`MaterialsReceivingService#update` still deletes and recreates a draft
receiving's package rows wholesale when the receive quantity/packing/ratio
changes, rather than doing a stable upsert. This is a deliberate, scoped
exception to "never hard-delete QR/package history": it is only reachable
while `receiving.status === 'draft'`, and a draft's packages are always
`status: 'pending'` — no `stock_transactions` row can reference their
`sub_qr_id` yet, because that only happens inside `confirmWithManager`,
which itself requires `status === 'draft'` and therefore hasn't run for
these rows. A still-draft package is a working proposal, not yet real
traceability history. See the inline comment at the delete call site in
`materials-receiving.service.ts` for the exact reasoning, and revisit this
if the product ever needs to pre-print/apply QR labels before confirm.

## The `material-traceability` module

`src/modules/material-traceability/` — `material-traceability.controller.ts`
/ `.service.ts` / `.module.ts` / `dto/query-material-traceability.dto.ts`.
Registered in `app.module.ts`. See `API_ENDPOINTS.md` § 17 for the full
route/filter/response reference — this section covers the *why*, not the
wire contract.

- **One filter DTO, one `applyFilters` method**, used identically by the
  summary aggregate query, the paginated movement query, and (by the
  frontend re-issuing the same query string) every export — so a filtered
  screen and its export can never disagree. See `QueryMaterialTraceabilityDto`'s
  own doc comment.
- **Every filter value is bound as a query parameter** (`:name` placeholders
  via TypeORM's `QueryBuilder`), never concatenated into the SQL string —
  this was an explicit requirement given the pre-existing
  `GET /materials-receiving/unified-report` endpoint's unsafe raw
  interpolation of `materialId`, which this module does not extend or reuse.
  `material-traceability.service.spec.ts` has a regression test that feeds a
  SQL-injection-shaped string through `materialCode` and asserts it never
  appears in the generated SQL text, only in the bound parameters object.
- **Running-balance reconciliation (§11 of the spec)**: for every distinct
  material touched by the current filtered result (capped at 25 per
  request — `MAX_RECONCILED_MATERIALS` — to bound query fan-out on a broad,
  unfiltered report), the service sums that material's **entire** ledger
  history (`SUM(quantity_in) - SUM(quantity_out)`, not scoped to the
  report's date range — a mismatch is a data-integrity question, not a
  "what happened this month" one) and compares it against the live
  `stock_balances.quantity` row. Any disagreement sets `isMatched: false`
  on that entry and `hasMismatch: true` on the summary — this is the
  `STOCK MISMATCH` flag the spec requires.
- **QR trace (§12)**: `GET /material-traceability/qr/:code` tries a SUB QR
  match (`lotDetailNo`) first, then falls back to a MAIN QR match
  (`internalLotNo`). Scanning either shows the full timeline plus, for a SUB
  QR, its parent MAIN QR (so the frontend can "click up" per the spec).
- **FIFO traceability (§13)**: `disbursements/:id` returns each item's
  `fifoAllocations[]` in draw order (`fifo_order`), each entry carrying the
  source lot's `internalLotNo`/`receiveDate` so the report can show *why*
  that lot/QR was chosen (oldest first) — and reversed allocations stay in
  the array (with `reversedAt`/`reversedBy` populated) rather than being
  filtered out, so a cancelled disbursement's FIFO history is not erased.
- **Permission**: no new permission code was minted. Every route requires
  `MATERIALS_RECEIVING_VIEW` **or** `MATERIALS_DISBURSEMENT_VIEW` via
  `@RequireAnyPermissions` (the guard's real OR primitive — distinct from
  `@RequirePermissions`, which is AND; see `permission.guard.ts`). A
  warehouse role that can only see one of the two flows can still open the
  joint report; SUPER_ADMIN bypasses the check entirely as usual.

## What this module deliberately does not do

- It does not expose server-side CSV/Excel/PDF export endpoints. The
  handoff's own suggested approach — "share one typed query/filter contract
  with frontend export generation" — was chosen: the frontend re-issues the
  exact same `QueryMaterialTraceabilityDto` query string against
  `GET /material-traceability` (unpaginated-enough for a warehouse's real
  data volumes) and builds the export client-side, which is also this
  project's existing pattern for CSV export elsewhere (see
  `admin-dashboard/AGENTS.md`'s dashboard-home CSV-export entry).
- It does not backfill/guess provenance for legacy `stock_transactions` rows
  that predate this migration where a `sub_qr_id`/`main_qr_id` link is
  genuinely ambiguous — the migration's backfill only sets `main_qr_id`
  when the reference type is unambiguous (`MATERIAL_RECEIVING` rows point
  straight at their own id; other rows are matched by `reference_lot_no`
  only when exactly resolvable). A legacy row with no resolvable link stays
  `NULL` rather than being guessed — the report should treat a `NULL`
  `main_qr_id`/`sub_qr_id` as "unresolved legacy data," not an error.
