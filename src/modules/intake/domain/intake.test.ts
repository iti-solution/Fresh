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
