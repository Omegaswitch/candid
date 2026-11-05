import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
import { fillWeeks, weekStart } from "./analytics";

describe("analytics weeks", () => {
  it("finds the Monday", () => {
    expect(weekStart("2026-11-05")).toBe("2026-11-02");
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
  });
  it("fills 12 weeks oldest first", () => {
    const w = fillWeeks([{ week: "2026-11-02", count: 3 }, { week: "2026-10-19", count: 1 }], "2026-11-05");
    expect(w).toHaveLength(12);
    expect(w[11]).toEqual({ week: "2026-11-02", count: 3 });
    expect(w[9]).toEqual({ week: "2026-10-19", count: 1 });
    expect(w[0].week).toBe("2026-08-17");
  });
});
