import { describe, expect, it } from "vitest";
import { approveSchema, confidenceTone, intakeErrorMessage, matchSender, messageSchema, phoneKey } from "./intake";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const P1 = "33333333-3333-4333-8333-333333333333";

describe("nadawca", () => {
  it("telefon w różnych zapisach", () => {
    expect(phoneKey("+48 600-100-200")).toBe("600100200");
    expect(phoneKey("0048600100200")).toBe("600100200");
    expect(phoneKey("123")).toBe(null);
  });
  it("rozpoznaje klienta po telefonie oddziału albo e-mailu portalu", () => {
    const cands = [
      { customerId: C1, pointId: P1, phone: "600 100 200" },
      { customerId: C2, pointId: null, email: "Kuchnia@Bistro.pl" },
    ];
    expect(matchSender("+48600100200", cands)).toEqual({ customerId: C1, pointId: P1 });
    expect(matchSender("kuchnia@bistro.pl", cands)).toEqual({ customerId: C2, pointId: null });
    expect(matchSender("+48 700 000 000", cands)).toBe(null);
  });
  it("ten sam numer u dwóch klientów — wybiera człowiek", () => {
    const cands = [
      { customerId: C1, pointId: P1, phone: "600100200" },
      { customerId: C2, pointId: null, phone: "600100200" },
    ];
    expect(matchSender("600100200", cands)).toBe(null);
  });
});

describe("formularze", () => {
  it("wiadomość wymaga treści i kanału", () => {
    expect(messageSchema.safeParse({ channel: "sms", body: "  " }).success).toBe(false);
    const ok = messageSchema.safeParse({ channel: "sms", body: "10 kg bananów", customer_id: "" });
    expect(ok.success && ok.data.customer_id).toBe(null);
  });
  it("zatwierdzenie wymaga oddziału, dnia i pozycji z produktem", () => {
    const base = { delivery_point_id: P1, delivery_date: "2026-11-03" };
    expect(
      approveSchema.safeParse({ ...base, lines: JSON.stringify([{ product_id: C1, qty: 2, draft_line_id: null }]) }).success,
    ).toBe(true);
    expect(approveSchema.safeParse({ ...base, lines: "[]" }).success).toBe(false);
    expect(approveSchema.safeParse({ ...base, lines: JSON.stringify([{ product_id: "", qty: 2 }]) }).success).toBe(false);
  });
  it("błędy bazy po polsku", () => {
    expect(intakeErrorMessage("INTAKE_ALREADY_REVIEWED")).toMatch(/już sprawdził/);
  });
  it("kolor pewności", () => {
    expect([confidenceTone(0.95), confidenceTone(0.6), confidenceTone(0.2), confidenceTone(null)]).toEqual([
      "success",
      "warning",
      "danger",
      "danger",
    ]);
  });
});

describe("portal i nagrania", () => {
  it("nagranie: rozmiar i typ", async () => {
    const { audioProblem, audioExtension } = await import("./intake");
    expect(audioProblem(null)).toBe(null);
    expect(audioProblem({ size: 1000, type: "audio/webm;codecs=opus" })).toBe(null);
    expect(audioProblem({ size: 4 * 1024 * 1024, type: "audio/webm" })).toMatch(/za długie/);
    expect(audioProblem({ size: 1000, type: "image/png" })).toMatch(/nie jest nagraniem|nie jest nagranie/);
    expect(audioExtension("audio/mp4")).toBe("m4a");
  });
  it("skuteczność jednego zamówienia: trafione / (zostawione + dodane + usunięte)", async () => {
    const { draftScore } = await import("./intake");
    const proposals = [
      { id: "a", productId: "p1", qty: 10 },
      { id: "b", productId: "p2", qty: 5 },
      { id: "c", productId: null, qty: 4 },
    ];
    const lines = [
      { draftLineId: "a", productId: "p1", qty: 10 }, // trafione
      { draftLineId: "b", productId: "p2", qty: 6 }, // poprawione
      { draftLineId: null, productId: "p3", qty: 1 }, // dodane; „c” usunięte
    ];
    expect(draftScore(lines, proposals)).toEqual({ hit: 1, total: 4 });
  });
});
