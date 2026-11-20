import React, { memo } from 'react'

function DataTable({ columns, rows, onRowClick, mobileCard }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-card border border-line bg-white shadow-card md:block">
        <table className="w-full text-left">
          <thead className="border-b border-line bg-canvas">
            <tr>{columns.map((column) => <th key={column.key} className="px-4 py-3 text-xs font-medium text-fg-muted">{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id}
                style={{ animationDelay: `${Math.min(index * 24, 200)}ms` }}
                className="content-row cursor-pointer border-b border-line last:border-0 hover:bg-canvas focus-visible:bg-canvas"
                onClick={() => onRowClick?.(row)}
                tabIndex={0}
                onKeyDown={(event) => { if (event.key === 'Enter') onRowClick?.(row) }}
              >
                {columns.map((column) => <td key={column.key} className="px-4 py-3 text-sm">{column.render ? column.render(row) : row[column.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:hidden">
        {rows.map((row, index) => (
          <button key={row.id} style={{ animationDelay: `${Math.min(index * 24, 200)}ms` }} className="content-card rounded-card border border-line bg-white p-4 text-left shadow-card" onClick={() => onRowClick?.(row)}>
            {mobileCard(row)}
          </button>
        ))}
      </div>
    </>
  )
}

export default memo(DataTable)
