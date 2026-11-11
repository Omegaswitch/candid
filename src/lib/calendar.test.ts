import { describe, expect, it } from "vitest";
import { groupByDay, monthGrid, shiftMonth } from "./calendar";

describe("monthGrid", () => {
  it("starts on a Monday and pads with the neighbouring months", () => {
    // November 2026 starts on a Sunday, so the first row begins on Monday 26 October.
    const g = monthGrid(2026, 11);
    expect(g.from).toBe("2026-10-26");
    expect(g.weeks[0][0]).toEqual({ iso: "2026-10-26", inMonth: false });
    expect(g.weeks[0][6]).toEqual({ iso: "2026-11-01", inMonth: true });
    expect(g.to).toBe("2026-12-06");
    expect(g.weeks).toHaveLength(6);
  });

  it("uses only the weeks a month needs", () => {
    // February 2027 starts on a Monday and has 28 days: exactly four rows.
    const g = monthGrid(2027, 2);
    expect(g.weeks).toHaveLength(4);
    expect(g.from).toBe("2027-02-01");
    expect(g.to).toBe("2027-02-28");
    expect(g.weeks.flat().every((d) => d.inMonth)).toBe(true);
  });

  it("handles leap years", () => {
    const days = monthGrid(2028, 2).weeks.flat().filter((d) => d.inMonth);
    expect(days).toHaveLength(29);
  });
});

describe("shiftMonth", () => {
  it("rolls the year both ways", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 5, 0)).toEqual({ year: 2026, month: 5 });
  });
});

describe("groupByDay", () => {
  it("groups in input order", () => {
    const m = groupByDay([{ d: "a", n: 1 }, { d: "b", n: 2 }, { d: "a", n: 3 }], (x) => x.d);
    expect(m.get("a")?.map((x) => x.n)).toEqual([1, 3]);
    expect(m.get("b")?.map((x) => x.n)).toEqual([2]);
  });
});
