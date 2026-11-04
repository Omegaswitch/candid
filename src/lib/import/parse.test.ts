import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { decodeText, parseCsv, parseFile, parsePaste, parseXlsx, splitHeader, xlsxCell } from "./parse";

const CZ = "Příliš žluťoučký kůň";

describe("parseCsv", () => {
  it.each([
    [",", "Project,Task\nA,One\n"],
    [";", "Project;Task\nA;One\n"],
    ["tab", "Project\tTask\nA\tOne\n"],
  ])("detects the %s delimiter", (_, text) => {
    expect(parseCsv(text).sheets[0].rows).toEqual([
      ["Project", "Task"],
      ["A", "One"],
    ]);
  });

  it("strips a UTF-8 BOM and keeps Czech characters", () => {
    const bytes = new TextEncoder().encode(`﻿Project;Client\n${CZ};Úřad\n`);
    const wb = parseCsv(decodeText(bytes));
    expect(wb.sheets[0].rows[0][0]).toBe("Project");
    expect(wb.sheets[0].rows[1]).toEqual([CZ, "Úřad"]);
  });

  it("reads Windows-1250 files from Czech Excel", () => {
    // "kůň" in Windows-1250: k=0x6b, ů=0xf9, ň=0xf2
    expect(decodeText(new Uint8Array([0x6b, 0xf9, 0xf2]))).toBe("kůň");
  });

  it("keeps empty cells as null, numbers as text and drops trailing empty rows/columns", () => {
    const rows = parseCsv("Project,Task,\nA,,\n007,x,\n,,\n").sheets[0].rows;
    expect(rows).toEqual([
      ["Project", "Task"],
      ["A", null],
      ["007", "x"],
    ]);
  });

  it("parses a file by extension and refuses macro workbooks", async () => {
    const file = (name: string, text: string) => ({ name, size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer });
    expect((await parseFile(file("a.csv", "Project\nA"))).sheets[0].rows).toEqual([["Project"], ["A"]]);
    await expect(parseFile(file("a.xlsm", ""))).rejects.toMatchObject({ code: "macro" });
    await expect(parseFile(file("a.pdf", ""))).rejects.toMatchObject({ code: "unsupported" });
  });
});

describe("parsePaste", () => {
  it("reads tab-separated rows with quoted multiline cells", () => {
    const text = 'Project\tTask\tTask note\r\nA\tOne\t"line 1\r\nline 2"\r\nA\t"Say ""hi"""\t\r\n';
    expect(parsePaste(text).sheets[0].rows).toEqual([
      ["Project", "Task", "Task note"],
      ["A", "One", "line 1\nline 2"],
      ["A", 'Say "hi"', null],
    ]);
  });
});

describe("parseXlsx", () => {
  async function book(fill: (ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook) => void) {
    const wb = new ExcelJS.Workbook();
    fill(wb.addWorksheet("Projects"), wb);
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  it("reads every sheet; cached formula results, uncached formulas flagged, rich text and dates", async () => {
    const bytes = await book((ws, wb) => {
      ws.addRow(["Project", "Total", "Pending", "Note", "Due"]);
      ws.addRow([CZ, { formula: "1+1", result: 2 }, { formula: "SUM(Z1:Z9)" }, { richText: [{ text: "bold " }, { text: "plain" }] }, new Date(Date.UTC(2026, 2, 4))]);
      wb.addWorksheet("Second").addRow(["x"]);
    });
    const wb = await parseXlsx(bytes, "book.xlsx");
    expect(wb.sheets.map((s) => s.name)).toEqual(["Projects", "Second"]);
    expect(wb.sheets[0].rows[1]).toEqual([CZ, 2, { formula: "SUM(Z1:Z9)", unsupported: true }, "bold plain", "2026-03-04"]);
  });

  it("maps cell shapes without evaluating anything", () => {
    expect(xlsxCell({ value: { formula: "A1", result: "hi" } })).toBe("hi");
    expect(xlsxCell({ value: { sharedFormula: "B2", result: 3 } })).toBe(3);
    expect(xlsxCell({ value: { formula: "1/0", result: { error: "#DIV/0!" } } })).toEqual({ formula: "1/0", unsupported: true });
    expect(xlsxCell({ value: { text: "Site", hyperlink: "https://x" } })).toBe("Site");
    expect(xlsxCell({ value: true })).toBe(true);
  });

  it("refuses a workbook that carries a VBA project", async () => {
    const fake = new TextEncoder().encode("PK....xl/vbaProject.bin....");
    await expect(parseXlsx(fake)).rejects.toMatchObject({ code: "macro" });
  });
});

describe("splitHeader", () => {
  it("uses the first non-empty row and reports sheet row numbers", () => {
    const r = splitHeader([[null, null], ["Project", "Task"], ["A", "B"]]);
    expect(r).toEqual({ header: ["Project", "Task"], rows: [["A", "B"]], firstRow: 3 });
  });
});
