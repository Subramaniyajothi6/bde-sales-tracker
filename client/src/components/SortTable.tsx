import { useState, type ReactNode } from 'react';

export interface Col<T> {
  label: string;
  /** Number to sort by. Columns with a value are sortable and right-aligned. */
  value?: (r: T) => number;
  cell?: (r: T) => ReactNode;
  cls?: string;
}

/** Table with click-to-sort number columns and clickable rows. */
export function SortTable<T>({ rows, cols, rowKey, onRow, initialSort, footer }: {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string | number; onRow?: (r: T) => void; initialSort?: number; footer?: ReactNode;
}) {
  const [sort, setSort] = useState(initialSort ?? -1);
  const sorted = sort >= 0 && cols[sort]?.value ? [...rows].sort((a, b) => cols[sort].value!(b) - cols[sort].value!(a)) : rows;
  return (
    <div className="scroll">
      <table className="data">
        <thead>
          <tr>
            {cols.map((c, i) => c.value
              ? <th key={c.label} scope="col" className="num"><button type="button" aria-sort={i === sort ? 'descending' : undefined} onClick={() => setSort(i)}>{c.label}</button></th>
              : <th key={c.label} scope="col">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={rowKey(r)} className={onRow ? 'click' : undefined} tabIndex={onRow ? 0 : undefined}
              onClick={onRow ? () => onRow(r) : undefined} onKeyDown={onRow ? e => { if (e.key === 'Enter') onRow(r); } : undefined}>
              {cols.map(c => <td key={c.label} className={c.cls ?? (c.value ? 'num' : undefined)}>{c.cell ? c.cell(r) : c.value?.(r)}</td>)}
            </tr>
          ))}
          {footer}
        </tbody>
      </table>
    </div>
  );
}
