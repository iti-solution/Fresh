import { expect, test } from "@playwright/test";

test("strona logowania się wyświetla", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();
  await expect(page.getByLabel("Adres e-mail")).toBeVisible();
});

test("niezalogowany użytkownik trafia z panelu na logowanie", async ({ page }) => {
  await page.goto("/planowanie");
  await expect(page).toHaveURL(/\/login\?next=%2Fplanowanie/);
});

test("aplikacja kierowcy prowadzi na logowanie PIN-em", async ({ page }) => {
  await page.goto("/driver");
  await expect(page).toHaveURL(/\/driver\/login/);
});

test("przypisanie terminala wymaga logowania biura", async ({ page }) => {
  await page.goto("/driver/terminal");
  await expect(page).toHaveURL(/\/login\?next=%2Fdriver%2Fterminal/);
});

test("błędny e-mail pokazuje komunikat", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Adres e-mail").fill("to-nie-jest-email@");
  await page.getByLabel("Adres e-mail").evaluate((el: HTMLInputElement) => (el.type = "text"));
  await page.getByRole("button", { name: "Wyślij link do logowania" }).click();
  await expect(page.getByText("Podaj poprawny adres e-mail.")).toBeVisible();
});

test("portal zamówień prowadzi niezalogowanego klienta na swoje logowanie", async ({ page }) => {
  await page.goto("/portal/zamow");
  await expect(page).toHaveURL(/\/portal\/login$/);
  await expect(page.getByRole("heading", { name: "Zamów dostawę na jutro" })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Hasło")).toBeVisible();
});

test("logowanie do portalu wymaga e-maila i hasła", async ({ page }) => {
  await page.goto("/portal/login");
  await page.getByLabel("E-mail").fill("kuchnia@restauracja.pl");
  await page.getByLabel("Hasło").evaluate((el: HTMLInputElement) => el.removeAttribute("required"));
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByText("Podaj e-mail i hasło.")).toBeVisible();
});

test("API zamówień wymaga klucza firmy", async ({ request }) => {
  const res = await request.post("/api/v1/orders", { data: { orders: [] } });
  expect(res.status()).toBe(401);
  expect((await res.json()).error).toBe("missing_api_key");
});

test("API kierowcy bez sesji zwraca 401 zamiast przekierowania", async ({ request }) => {
  const res = await request.post("/api/driver/sync", { data: { events: [] }, maxRedirects: 0 });
  expect(res.status()).toBe(401);
});

test("aplikacja kierowcy ma manifest i service worker", async ({ request }) => {
  const m = await request.get("/driver.webmanifest");
  expect(m.ok()).toBe(true);
  expect((await m.json()).start_url).toBe("/driver");
  const sw = await request.get("/driver-sw.js");
  expect(sw.ok()).toBe(true);
});
