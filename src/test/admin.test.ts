import { describe, expect, it } from "vitest";
import { formatEtb, formatNumber, titleCase, statusTone } from "@/lib/admin/format";
import { DEFAULT_SYSTEM_SETTINGS } from "@/lib/admin/constants";

describe("admin format helpers", () => {
  it("formats ETB currency", () => {
    expect(formatEtb(1500)).toContain("ETB");
    expect(formatEtb(0)).toContain("0");
  });

  it("formats numbers with locale", () => {
    expect(formatNumber(1000)).toBe("1,000");
  });

  it("title-cases snake_case", () => {
    expect(titleCase("admin_login")).toBe("Admin Login");
  });

  it("returns status tone classes", () => {
    expect(statusTone("live")).toContain("emerald");
    expect(statusTone("pending")).toContain("amber");
    expect(statusTone("rejected")).toContain("muted");
  });
});

describe("default system settings", () => {
  it("includes required game configuration keys", () => {
    expect(DEFAULT_SYSTEM_SETTINGS.public_stakes).toBeTruthy();
    expect(DEFAULT_SYSTEM_SETTINGS.house_commission_pct).toBe("20");
    expect(DEFAULT_SYSTEM_SETTINGS.deposits_enabled).toBe("true");
  });
});
