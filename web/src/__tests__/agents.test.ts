import { vi, describe, test, expect } from "vitest";

// Mock Supabase to prevent crash at import time during unit testing
vi.mock("@/lib/supabase", () => ({
  supabase: {
    table: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null })
      })
    })
  },
  supabaseAdmin: {
    table: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null })
      })
    })
  }
}));

// Mock Neo4j client
vi.mock("@/lib/neo4j-client", () => ({
  runQuery: vi.fn()
}));

import { decodeSkuCode, nccCountryScore, getChannelFromRole } from "../lib/agents/tools";
import { convertCogs } from "../lib/agents/context";
import { extractParams } from "../lib/agents/router";

describe("AI Agent Helper Functions (Unit Tests)", () => {
  
  // 1. Test decodeSkuCode()
  describe("decodeSkuCode()", () => {
    test("should correctly decode a standard 13-character SKU code", () => {
      const result = decodeSkuCode("1CTHA12A00107");
      expect(result).toBeDefined();
      expect(result["sku_code"]).toBe("1CTHA12A00107");
      expect(result["ký tự 3-5 — Country Group"]).toBe("THA");
      expect(result["ký tự 6-7 — Vendor"]).toBe("12");
    });

    test("should return empty object or partial values for invalid SKU formats", () => {
      const result = decodeSkuCode("SHORT-CODE");
      expect(result).toBeDefined();
    });
  });

  // 2. Test convertCogs()
  describe("convertCogs()", () => {
    const mockFxRates = {
      "fx.usd_vnd": 26000,
      "fx.hkd_usd": 0.128,
      "fx.twd_usd": 0.031
    };

    test("should convert USD cost correctly", () => {
      const result = convertCogs(10, "USD", mockFxRates);
      expect(result.usd).toBe(10);
      expect(result.vnd).toBe(260000);
    });

    test("should convert HKD cost correctly", () => {
      const result = convertCogs(78, "HKD", mockFxRates);
      expect(result.usd).toBeCloseTo(9.98, 1);
      expect(result.vnd).toBeCloseTo(259584, 1);
    });
  });

  // 3. Test nccCountryScore()
  describe("nccCountryScore()", () => {
    test("should give direct country match score of 3", () => {
      const score = nccCountryScore("Thailand", "eSIM Thailand Unlimited", "Thailand");
      expect(score).toBe(3);
    });

    test("should score regional match lower", () => {
      const score = nccCountryScore("Europe", "Europe eSIM 33 Countries", "Germany");
      expect(score).toBe(2);
    });

    test("should score global match as 1", () => {
      const score = nccCountryScore("Global", "Global Unlimited eSIM", "Vietnam");
      expect(score).toBe(1);
    });

    test("should return 0 if no match is found", () => {
      const score = nccCountryScore("Vietnam", "eSIM Vietnam Daily", "USA");
      expect(score).toBe(0);
    });
  });

  // 4. Test getChannelFromRole()
  describe("getChannelFromRole()", () => {
    test("should map sales and standard roles to channels", () => {
      expect(getChannelFromRole("b2c")).toBe("B2C");
      expect(getChannelFromRole("saleb2c")).toBe("B2C");
      expect(getChannelFromRole("b2b")).toBe("B2B");
    });

    test("should return null for admin, bod, and other roles", () => {
      expect(getChannelFromRole("admin")).toBeNull();
      expect(getChannelFromRole("bod")).toBeNull();
      expect(getChannelFromRole("manager")).toBeNull();
    });
  });

  // 5. Test extractParams() inside router.ts
  describe("extractParams()", () => {
    test("should extract country name, validity days, and data GBs correctly from simple query", () => {
      const params = extractParams("Đi Thái Lan 5 ngày gói 10GB");
      expect(params.country).toBe("Thailand"); // Thái Lan -> Thailand mapping
      expect(params.days).toBe(5);
      expect(params.dataGB).toBe(10);
    });

    test("should handle 'không giới hạn' and maps isUnlimited to true", () => {
      const params = extractParams("gói Nhật Bản không giới hạn 7 ngày");
      expect(params.country).toBe("Japan");
      expect(params.days).toBe(7);
      expect(params.isUnlimited).toBe(true);
    });

    test("should recognize simple parameters and country Singapore", () => {
      const params = extractParams("Singapore 3 ngày");
      expect(params.country).toBe("Singapore");
      expect(params.days).toBe(3);
    });
  });
});
