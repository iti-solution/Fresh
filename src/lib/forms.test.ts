import { describe, expect, it } from "vitest";
import { formatPlnCompact } from "./forms";

describe("formatPlnCompact", () => {
  it("skraca duże kwoty do kafelków", () => {
    expect(formatPlnCompact(124_000)).toBe("1240 zł".replace("1240", (1240).toLocaleString("pl-PL")));
    expect(formatPlnCompact(6_619_400)).toBe(`${(66.2).toLocaleString("pl-PL")} tys. zł`);
    expect(formatPlnCompact(140_000_000)).toBe(`${(1.4).toLocaleString("pl-PL")} mln zł`);
  });
});
