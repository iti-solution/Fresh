import { describe, expect, it } from "vitest";
import { apiKeyFromHeaders, apiKeyName, generateApiKey, hashApiKey } from "./api-keys";

describe("klucze API", () => {
  it("generuje różne klucze z prefiksem i stałym skrótem", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^drv_[A-Za-z0-9_-]{32}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).toBe(a.key.slice(0, 10));
    expect(hashApiKey(a.key)).toHaveLength(64);
    expect(hashApiKey(a.key)).toBe(hashApiKey(a.key));
  });
  it("czyta klucz z nagłówków", () => {
    const k = generateApiKey().key;
    const h = (m: Record<string, string>) => (n: string) => m[n] ?? null;
    expect(apiKeyFromHeaders(h({ authorization: `Bearer ${k}` }))).toBe(k);
    expect(apiKeyFromHeaders(h({ "x-api-key": k }))).toBe(k);
    expect(apiKeyFromHeaders(h({ authorization: "Bearer abc" }))).toBeNull();
    expect(apiKeyFromHeaders(h({}))).toBeNull();
  });
  it("nazwa klucza", () => {
    expect(apiKeyName(" WF-Mag ")).toBe("WF-Mag");
    expect(apiKeyName("x")).toBeNull();
  });
});
