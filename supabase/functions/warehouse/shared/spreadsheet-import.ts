import { HttpError } from "./http.ts";

export type ImportColumn = {
  header: string;
  key: string;
  required?: boolean;
  kind?: "text" | "number" | "boolean";
  maxLength?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  decimalPlaces?: number;
  choices?: string[];
  description?: string;
  example?: string | number | boolean;
};
export type ImportValue = string | number | boolean | null;
export type ImportRow = { row: number; values: Record<string, ImportValue>; error?: string };
export const MAX_IMPORT_ROWS = 2_000;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export function validateImportFile(file: unknown): asserts file is File {
  if (!(file instanceof File) || !file.size || file.size > MAX_IMPORT_BYTES || !/\.xlsx$/i.test(file.name)) {
    throw new HttpError(400, "Upload an .xlsx workbook no larger than 10 MB.");
  }
}

function scalar(value: unknown): ImportValue {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error("Use plain text, numbers or Yes/No values; formulas, dates and linked cells are not supported.");
}
function parseCell(value: unknown, column: ImportColumn): ImportValue {
  const raw = scalar(value);
  const text = raw === null ? "" : String(raw).trim();
  if (!text) {
    if (column.required) throw new Error(`${column.header} is required.`);
    return null;
  }
  if (column.kind === "boolean") {
    if (/^(yes|true|1)$/i.test(text)) return true;
    if (/^(no|false|0)$/i.test(text)) return false;
    throw new Error(`${column.header}: enter Yes or No.`);
  }
  if (column.kind === "number") {
    if (typeof raw === "boolean" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) throw new Error(`${column.header}: enter a number without units or separators.`);
    const number = Number(text);
    if (!Number.isFinite(number) || (column.integer && !Number.isInteger(number)) || (column.min !== undefined && number < column.min) || (column.max !== undefined && number > column.max)) {
      throw new Error(`${column.header}: enter ${column.integer ? "a whole number" : "a number"}${column.min !== undefined ? ` of at least ${column.min}` : ""}${column.max !== undefined ? ` and no more than ${column.max}` : ""}.`);
    }
    if (column.decimalPlaces !== undefined) {
      const scaled = number * 10 ** column.decimalPlaces;
      if (Math.abs(scaled - Math.round(scaled)) > 0.00001) throw new Error(`${column.header}: use no more than ${column.decimalPlaces} decimal places.`);
    }
    return number;
  }
  if (typeof raw === "boolean") throw new Error(`${column.header}: enter text.`);
  if (column.maxLength && text.length > column.maxLength) throw new Error(`${column.header}: use no more than ${column.maxLength} characters.`);
  if (column.choices && !column.choices.includes(text.toLowerCase())) throw new Error(`${column.header}: choose ${column.choices.join(", ")}.`);
  return column.choices ? text.toLowerCase() : text;
}

// The ExcelJS adapter is deliberately small so parsing can be exercised without a database.
export function parseImportSheet(sheet: any, columns: ImportColumn[], options: { maxRows?: number } = {}): ImportRow[] {
  const maxRows = options.maxRows ?? MAX_IMPORT_ROWS;
  const aliases = new Map(columns.flatMap((column) => [column.header, column.key].map((label) => [label.toLowerCase(), column] as const)));
  const headers = new Map<number, ImportColumn>();
  const seen = new Set<string>();
  sheet.getRow(1).eachCell((cell: any, index: number) => {
    let label: string;
    try { label = String(scalar(cell.value) ?? "").trim(); } catch { throw new HttpError(400, "Use plain text column headings in row 1."); }
    if (!label) return;
    const column = aliases.get(label.toLowerCase());
    if (!column) throw new HttpError(400, `Unknown column '${label}'. Use the downloaded template headings.`);
    if (seen.has(column.key)) throw new HttpError(400, `Column '${column.header}' appears more than once.`);
    seen.add(column.key);
    headers.set(index, column);
  });
  const missing = columns.filter((column) => column.required && !seen.has(column.key));
  if (missing.length) throw new HttpError(400, `Add the required column${missing.length > 1 ? "s" : ""}: ${missing.map((column) => column.header).join(", ")}.`);
  const rows: ImportRow[] = [];
  sheet.eachRow((row: any, rowNumber: number) => {
    if (rowNumber === 1) return;
    const occupied: number[] = [];
    row.eachCell((cell: any, index: number) => {
      if (cell.value !== null && cell.value !== undefined && String(cell.value).trim()) occupied.push(index);
    });
    if (!occupied.length) return;
    if (rows.length >= maxRows) throw new HttpError(400, `Import up to ${maxRows.toLocaleString("en-GB")} rows at a time.`);
    const entry: ImportRow = { row: rowNumber, values: {} };
    const errors: string[] = [];
    if (occupied.some((index) => !headers.has(index))) errors.push("A value has no column heading. Add a supported heading or remove the value.");
    for (const [index, column] of headers) {
      try { entry.values[column.key] = parseCell(row.getCell(index).value, column); }
      catch (error) { errors.push(error instanceof Error ? error.message : "Check this cell."); }
    }
    if (errors.length) entry.error = errors.join(" ");
    rows.push(entry);
  });
  if (!rows.length) throw new HttpError(400, "Add at least one row below the headings before uploading.");
  return rows;
}

export async function loadImportWorkbook(file: File, ExcelJS: any, sheetName: string) {
  validateImportFile(file);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(await file.arrayBuffer()); }
  catch { throw new HttpError(400, "This workbook could not be read. Save it as an .xlsx file and try again."); }
  const sheet = workbook.getWorksheet(sheetName) ?? workbook.worksheets.find((entry: any) => !["instructions", "examples", "lookup codes"].includes(entry.name.toLowerCase()));
  if (!sheet) throw new HttpError(400, `The workbook does not contain a ${sheetName.toLowerCase()} sheet.`);
  return sheet;
}

export function buildImportWorkbook(ExcelJS: any, sheetName: string, columns: ImportColumn[], instructions: string[]) {
  const book = new ExcelJS.Workbook();
  book.creator = "Multideck";
  const sheet = book.addWorksheet(sheetName);
  sheet.addRow(columns.map((column) => column.header));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { name: "Arial", bold: true };
  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = Math.min(36, Math.max(18, column.header.length + 3));
    sheet.getColumn(index + 1).font = { name: "Arial" };
    if (!column.kind || column.kind === "text") sheet.getColumn(index + 1).numFmt = "@";
    sheet.getCell(1, index + 1).note = `${column.required ? "Required" : "Optional"}. ${column.description ?? ""}`;
  });
  sheet.getRow(1).font = { name: "Arial", bold: true };
  const guide = book.addWorksheet("Instructions");
  guide.addRow(["Multideck warehouse import"]);
  for (const instruction of [
    `Fill the ${sheetName} sheet, keeping the headings in row 1. Only ${columns.filter((column) => column.required).map((column) => column.header).join(" and ")} are required for each row.`,
    "Upload the workbook to review it. Nothing is created until you confirm the import. Existing records are never overwritten.",
    "Use up to 2,000 rows and a file no larger than 10 MB. Use plain values, not formulas. Keep identifiers as text to preserve leading zeros.",
    ...instructions,
  ]) guide.addRow([instruction]);
  guide.addRow([]);
  guide.addRow(["Column", "Required", "Details"]);
  for (const column of columns) guide.addRow([column.header, column.required ? "Yes" : "No", column.description ?? (column.kind === "boolean" ? "Yes or No; defaults to No." : "Leave blank if not needed.")]);
  guide.getColumn(1).width = 36;
  guide.getColumn(2).width = 14;
  guide.getColumn(3).width = 90;
  guide.eachRow((row: any) => { row.font = { name: "Arial" }; row.alignment = { wrapText: true, vertical: "top" }; if (row.cellCount === 1) { guide.mergeCells(row.number, 1, row.number, 3); row.height = row.number === 1 ? 24 : 45; } });
  guide.getRow(1).font = { name: "Arial", bold: true };
  const examples = book.addWorksheet("Examples");
  examples.addRow(columns.map((column) => column.header));
  examples.addRow(columns.map((column) => column.example ?? ""));
  examples.getRow(1).font = { name: "Arial", bold: true };
  columns.forEach((column, index) => { examples.getColumn(index + 1).width = Math.max(18, column.header.length + 3); });
  return book;
}
