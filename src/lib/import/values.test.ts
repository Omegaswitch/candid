import { describe, expect, it } from "vitest";
import { parseBoolean } from "./booleans";
import { detectDateColumn, parseDate } from "./dates";
import { escapeCell, unescapeCell } from "./escape";
import { autoMap, mappingIsUsable } from "./mapping";

describe("dates", () => {
  it("accepts ISO and Czech D.M.Y", () => {
    expect(parseDate("2026-03-04")).toEqual({ ok: true, value: "2026-03-04" });
    expect(parseDate("2026-03-04T10:00:00Z")).toEqual({ ok: true, value: "2026-03-04" });
    expect(parseDate("3.4.2026")).toEqual({ ok: true, value: "2026-04-03" });
    expect(parseDate("3. 4. 2026")).toEqual({ ok: true, value: "2026-04-03" });
    expect(parseDate("")).toEqual({ ok: true, value: null });
  });

  it("reports 03/04/2026 as ambiguous until an order is chosen", () => {
    expect(parseDate("03/04/2026")).toEqual({ ok: false, ambiguous: true });
    expect(parseDate("03/04/2026", "dmy")).toEqual({ ok: true, value: "2026-04-03" });
    expect(parseDate("03/04/2026", "mdy")).toEqual({ ok: true, value: "2026-03-04" });
    expect(parseDate("25/04/2026")).toEqual({ ok: true, value: "2026-04-25" });
    expect(parseDate("04/25/2026")).toEqual({ ok: true, value: "2026-04-25" });
  });

  it("rejects impossible or unknown dates", () => {
    expect(parseDate("2026-02-30")).toEqual({ ok: false, ambiguous: false });
    expect(parseDate("31.13.2026")).toEqual({ ok: false, ambiguous: false });
    expect(parseDate("next week")).toEqual({ ok: false, ambiguous: false });
    expect(parseDate(46000)).toEqual({ ok: false, ambiguous: false });
  });

  it("detects column ambiguity and proven orders", () => {
    expect(detectDateColumn(["03/04/2026", "05/06/2026"])).toMatchObject({ ambiguous: true, example: "03/04/2026" });
    expect(detectDateColumn(["03/04/2026", "25/06/2026"])).toMatchObject({ ambiguous: false, detected: "dmy" });
    expect(detectDateColumn(["03/04/2026", "06/25/2026"])).toMatchObject({ ambiguous: false, detected: "mdy" });
    expect(detectDateColumn(["2026-03-04", "3.4.2026", null])).toMatchObject({ ambiguous: false, mixed: false });
    expect(detectDateColumn(["25/01/2026", "01/25/2026"])).toMatchObject({ mixed: true });
  });
});

describe("booleans", () => {
  it.each(["yes", "TRUE", "1", "y", "x", "X", "ano", "Done", 1, true])("%s is true", (v) => expect(parseBoolean(v)).toBe(true));
  it.each(["no", "false", "0", "n", "ne", "", null, 0, false])("%s is false", (v) => expect(parseBoolean(v)).toBe(false));
  it.each(["maybe", "hotovo", "2", 5, "yes please"])("%s is invalid", (v) => expect(parseBoolean(v)).toBeUndefined());
});

describe("formula injection", () => {
  it.each(["=SUM(A1)", "+1", "-2", "@cmd", "\tx", "\rx"])("prefixes %j with a quote and round-trips", (s) => {
    expect(escapeCell(s)).toBe(`'${s}`);
    expect(unescapeCell(escapeCell(s))).toBe(s);
  });
  it("leaves safe text alone", () => {
    expect(escapeCell("Příliš žluťoučký kůň")).toBe("Příliš žluťoučký kůň");
    expect(unescapeCell("'quoted")).toBe("'quoted");
  });
});

describe("mapping", () => {
  it("maps English headers and synonyms, case and spacing ignored", () => {
    expect(autoMap(["Project ID", "project_name", "Customer", "TASK", "Done", "Assignee", "Due date", "Whatever", "Task"])).toEqual([
      "projectId",
      "project",
      "client",
      "task",
      "completed",
      "assigneeEmail",
      "taskDueDate",
      null,
      null,
    ]);
    expect(mappingIsUsable(["task", null])).toBe(false);
    expect(mappingIsUsable(["projectId"])).toBe(true);
  });
});
