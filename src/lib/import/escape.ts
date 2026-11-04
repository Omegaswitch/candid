// Spreadsheet formula injection: a cell that starts with one of these is run as a formula by
// Excel/Sheets. Exports prefix such text with a single quote; imports strip that prefix again.
const DANGEROUS = /^[=+\-@\t\r]/;

export function escapeCell(s: string) {
  return DANGEROUS.test(s) ? `'${s}` : s;
}

export function unescapeCell(s: string) {
  return s.startsWith("'") && DANGEROUS.test(s.slice(1)) ? s.slice(1) : s;
}
