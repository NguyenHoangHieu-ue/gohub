import { describe, expect, it } from "vitest";
import { canSeeCogs, canWrite, stripCogsFields, type Role } from "./index";

describe("rbac permissions", () => {
  it("admin/creator can write config and see COGS", () => {
    for (const role of ["admin", "creator"] satisfies Role[]) {
      expect(canWrite(role)).toBe(true);
      expect(canSeeCogs(role)).toBe(true);
    }
  });

  it("staff cannot write config or see COGS", () => {
    expect(canWrite("staff")).toBe(false);
    expect(canSeeCogs("staff")).toBe(false);
  });

  it("bod can see COGS (BOD Report needs GP/CM1) but cannot write config", () => {
    expect(canWrite("bod")).toBe(false);
    expect(canSeeCogs("bod")).toBe(true);
  });

  it("b2c/saleb2c/hr default to least-privilege (no write, no COGS)", () => {
    for (const role of ["b2c", "saleb2c", "hr"] satisfies Role[]) {
      expect(canWrite(role)).toBe(false);
      expect(canSeeCogs(role)).toBe(false);
    }
  });

  it("unknown role falls back to least-privilege instead of throwing", () => {
    const unknownRole = "future_role" as Role;
    expect(() => canWrite(unknownRole)).not.toThrow();
    expect(canWrite(unknownRole)).toBe(false);
    expect(canSeeCogs(unknownRole)).toBe(false);
  });

  it("stripCogsFields removes cogs/gross_profit/gpm keys for staff, keeps for admin", () => {
    const row = { revenue: 1000, cogs_amount_vnd: 400, gross_profit_vnd: 600, gpm_pct: 60, orders: 5 };
    expect(stripCogsFields(row, "staff")).toEqual({ revenue: 1000, orders: 5 });
    expect(stripCogsFields(row, "admin")).toEqual(row);
  });
});
