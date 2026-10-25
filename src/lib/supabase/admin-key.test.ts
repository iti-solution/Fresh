import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ SUPABASE_URL: "https://x.supabase.co" }));

const { describeKeyProblem } = await import("./admin");
const jwt = (role: string) => `h.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.s`;

describe("describeKeyProblem", () => {
  it("akceptuje klucz sekretny i service_role", () => {
    expect(describeKeyProblem("sb_secret_abc")).toBeNull();
    expect(describeKeyProblem(jwt("service_role"))).toBeNull();
  });
  it("wykrywa klucz publiczny i anon", () => {
    expect(describeKeyProblem("sb_publishable_abc")).toMatch(/publiczny/);
    expect(describeKeyProblem(jwt("anon"))).toMatch(/anon/);
    expect(describeKeyProblem("cokolwiek")).toMatch(/nie wygląda/);
    expect(describeKeyProblem(undefined)).toMatch(/Brak/);
  });
});
