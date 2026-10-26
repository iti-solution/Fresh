import { describe, expect, it } from "vitest";
import { canAccess, homePathForRole, isPublicPath, navForRole, safeNextPath } from "./access";

describe("isPublicPath", () => {
  it("traktuje logowanie i callback auth jako publiczne", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/driver/login")).toBe(true);
  });
  it("chroni panel i aplikację kierowcy", () => {
    expect(isPublicPath("/pulpit")).toBe(false);
    expect(isPublicPath("/driver")).toBe(false);
    expect(isPublicPath("/driver/trasa/1")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
  });
});

describe("canAccess", () => {
  it("kierowca widzi tylko aplikację kierowcy", () => {
    expect(canAccess("driver", "/driver")).toBe(true);
    expect(canAccess("driver", "/pulpit")).toBe(false);
    expect(canAccess("driver", "/rozliczenia")).toBe(false);
  });
  it("dyspozytor nie wchodzi do ustawień ani aplikacji kierowcy", () => {
    expect(canAccess("dispatcher", "/planowanie")).toBe(true);
    expect(canAccess("dispatcher", "/ustawienia")).toBe(false);
    expect(canAccess("dispatcher", "/driver")).toBe(false);
  });
  it("podgląd nie ma audytu tras", () => {
    expect(canAccess("viewer", "/audyt")).toBe(false);
    expect(canAccess("viewer", "/kartoteki/klienci")).toBe(true);
  });
  it("admin ma dostęp wszędzie", () => {
    expect(canAccess("admin", "/ustawienia")).toBe(true);
    expect(canAccess("admin", "/driver")).toBe(true);
  });
});

describe("BOK i zarząd", () => {
  it("widzą panel, ale nie audyt tras ani ustawienia", () => {
    for (const role of ["customer_service", "management"] as const) {
      expect(canAccess(role, "/pulpit")).toBe(true);
      expect(canAccess(role, "/centrum")).toBe(true);
      expect(canAccess(role, "/audyt")).toBe(false);
      expect(canAccess(role, "/ustawienia")).toBe(false);
      expect(canAccess(role, "/driver")).toBe(false);
    }
  });
});

describe("menu i przekierowania", () => {
  it("kierowca nie ma menu panelu", () => {
    expect(navForRole("driver")).toHaveLength(0);
    expect(homePathForRole("driver")).toBe("/driver");
    expect(homePathForRole("dispatcher")).toBe("/pulpit");
    expect(homePathForRole("customer_service")).toBe("/bok");
    expect(homePathForRole("management")).toBe("/raport");
  });
  it("safeNextPath odrzuca zewnętrzne adresy", () => {
    expect(safeNextPath("/planowanie")).toBe("/planowanie");
    expect(safeNextPath("https://zly.pl")).toBeNull();
    expect(safeNextPath("//zly.pl")).toBeNull();
    expect(safeNextPath("/login")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});
