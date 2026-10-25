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
