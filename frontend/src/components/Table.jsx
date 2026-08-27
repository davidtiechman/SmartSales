import { Fragment } from "react";

function normalizeRow(row, rowIndex) {
  if (Array.isArray(row)) {
    return {
      key: rowIndex,
      cells: row,
      expandedContent: null,
      onClick: null,
      className: "",
    };
  }

  return {
    key: row.key ?? rowIndex,
    cells: row.cells || [],
    expandedContent: row.expandedContent || null,
    onClick: row.onClick || null,
    className: row.className || "",
  };
}

export function Table({ headers, rows, columnClassNames = [], columnWidths = [] }) {
  if (!rows.length) {
    return <p>אין נתונים להצגה.</p>;
  }

  const normalizedRows = rows.map(normalizeRow);

  return (
    <div className="table-wrap">
      <table className="table">
        {columnWidths.length ? (
          <colgroup>
            {columnWidths.map((width, index) => (
              <col key={`${index}-${width}`} style={{ width }} />
            ))}
          </colgroup>
        ) : null}
        <thead>
          <tr>
            {headers.map((header, columnIndex) => (
              <th key={header} className={columnClassNames[columnIndex] || undefined}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {normalizedRows.map((row) => (
            <Fragment key={row.key}>
              <tr className={row.className} onClick={row.onClick || undefined}>
                {row.cells.map((cell, cellIndex) => (
                  <td key={cellIndex} className={columnClassNames[cellIndex] || undefined}>{cell ?? ""}</td>
                ))}
              </tr>
              {row.expandedContent ? (
                <tr className="table__expanded-row">
                  <td colSpan={headers.length}>{row.expandedContent}</td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
