/**
 * Output formatting — human-readable tables or JSON for machine consumption.
 */

let _jsonMode = false;

export function setJsonMode(on: boolean): void {
  _jsonMode = on;
}

export function isJsonMode(): boolean {
  return _jsonMode;
}

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function printError(msg: string): void {
  process.stderr.write(`Error: ${msg}\n`);
}

export function printInfo(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

export function printTable(
  rows: Record<string, unknown>[],
  columns: { key: string; label: string; width?: number }[],
): void {
  if (_jsonMode) {
    printJson(rows);
    return;
  }
  if (rows.length === 0) {
    console.log("(no results)");
    return;
  }

  // Calculate column widths
  const widths = columns.map((col) => {
    const maxData = rows.reduce(
      (max, row) => Math.max(max, String(row[col.key] ?? "").length),
      0,
    );
    return col.width ?? Math.max(col.label.length, Math.min(maxData, 60));
  });

  // Header
  const header = columns
    .map((col, i) => col.label.padEnd(widths[i]))
    .join("  ");
  console.log(header);
  console.log(columns.map((_, i) => "─".repeat(widths[i])).join("  "));

  // Rows
  for (const row of rows) {
    const line = columns
      .map((col, i) => {
        const val = String(row[col.key] ?? "");
        return val.length > widths[i]
          ? val.slice(0, widths[i] - 1) + "…"
          : val.padEnd(widths[i]);
      })
      .join("  ");
    console.log(line);
  }
}

/** Print a single result — JSON or human-readable key-value. */
export function printResult(data: Record<string, unknown>): void {
  if (_jsonMode) {
    printJson(data);
    return;
  }
  const maxKey = Math.max(...Object.keys(data).map((k) => k.length));
  for (const [key, val] of Object.entries(data)) {
    console.log(`${key.padEnd(maxKey)}  ${val}`);
  }
}
