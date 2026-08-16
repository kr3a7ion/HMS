// UI Adoption F3 — tier-aware collection renderer.
//
// Doc 3 §2.4: "table at T4, cards at T1-T3. Single implementation point for
// empty/loading/error." Doc 3 §2.3: "Tier is a layout decision, not a
// component fork. Do not build HKBoardMobile.tsx."
//
// So a screen declares its columns ONCE and this decides the shape. The
// card renderer is not a second definition of the list -- it reads the same
// column array, which is what stops the two from drifting.
import type { ReactNode } from "react";
import { AsyncBoundary } from "./AsyncBoundary";
import { useTier, prefersTable, hasHover, touchTarget } from "../lib/tier";
import { BORDER, MUTED, SUBTLE, TEXT } from "../lib/tokens";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Shown as the card's title at T1–T3. Exactly one column should set this. */
  primary?: boolean;
  /** Dropped from the card layout — noise on a small screen. */
  tableOnly?: boolean;
  align?: "left" | "right";
}

export interface DataViewProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  /** Shown when there are no rows and no error. Always supply real wording. */
  empty?: ReactNode;
}

export function DataView<T>({
  rows, columns, rowKey, loading = false, error, onRetry, onRowClick, empty,
}: DataViewProps<T>) {
  const tier = useTier();

  return (
    <AsyncBoundary loading={loading} error={error} onRetry={onRetry}>
      {rows.length === 0
        ? <Empty>{empty ?? "Nothing here yet."}</Empty>
        : prefersTable(tier)
          ? <Table rows={rows} columns={columns} rowKey={rowKey} onRowClick={onRowClick} tier={tier} />
          : <Cards rows={rows} columns={columns} rowKey={rowKey} onRowClick={onRowClick} tier={tier} />}
    </AsyncBoundary>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg px-6 py-10 text-center text-[13px]"
      style={{ border: `1px dashed ${BORDER}`, color: MUTED }}
    >
      {children}
    </div>
  );
}

function Table<T>({
  rows, columns, rowKey, onRowClick, tier,
}: Pick<DataViewProps<T>, "rows" | "columns" | "rowKey" | "onRowClick"> & { tier: ReturnType<typeof useTier> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th
                key={c.key}
                className="px-3 py-2 text-left"
                style={{
                  borderBottom: `1px solid ${BORDER}`, color: MUTED,
                  fontWeight: 600, textAlign: c.align ?? "left",
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={hasHover(tier) && onRowClick ? "hover:bg-[#FAFBFD]" : undefined}
              style={{ cursor: onRowClick ? "pointer" : undefined }}
            >
              {columns.map(c => (
                <td
                  key={c.key}
                  className="px-3"
                  style={{
                    borderBottom: `1px solid ${BORDER}`, color: TEXT,
                    textAlign: c.align ?? "left", height: touchTarget(tier),
                  }}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Card list for T1–T3. Reads the SAME column array as the table: the primary
 * column becomes the title, `tableOnly` columns are dropped, and the rest
 * render as label/value pairs. No horizontal scroll, ever (Doc 3 §2.3).
 */
function Cards<T>({
  rows, columns, rowKey, onRowClick, tier,
}: Pick<DataViewProps<T>, "rows" | "columns" | "rowKey" | "onRowClick"> & { tier: ReturnType<typeof useTier> }) {
  const primary = columns.find(c => c.primary) ?? columns[0];
  const rest = columns.filter(c => c !== primary && !c.tableOnly);

  return (
    <div className="space-y-2">
      {rows.map(row => {
        const Wrapper = onRowClick ? "button" : "div";
        return (
          <Wrapper
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className="block w-full rounded-lg p-3 text-left"
            style={{ border: `1px solid ${BORDER}`, minHeight: touchTarget(tier) }}
          >
            <div className="text-[15px]" style={{ fontWeight: 600, color: TEXT }}>
              {primary.render(row)}
            </div>
            {rest.length > 0 && (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {rest.map(c => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[11px] uppercase" style={{ color: SUBTLE, letterSpacing: "0.04em" }}>
                      {c.header}
                    </dt>
                    <dd className="text-[13px] truncate" style={{ color: TEXT }}>{c.render(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Wrapper>
        );
      })}
    </div>
  );
}
