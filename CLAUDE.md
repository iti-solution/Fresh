# Fresh — instrukcje dla Claude Code

Fresh to SaaS TMS dla hurtowni owoców i warzyw dostarczających do HoReCa własną flotą (5–100 pojazdów). Właściciel produktu: Arkadiusz — **nie programuje**, zarządza produktem. Tłumacz decyzje techniczne prostym językiem, pokazuj plan przed większą zmianą.

## Dokumenty źródłowe (czytaj przed pracą)
- `docs/01-architektura.md` — architektura, moduły, przepływy, ADR
- `docs/02-zakres-mvp.md` — co jest w MVP, a co nie (nie dodawaj funkcji spoza zakresu bez pytania)
- `docs/04-plan-milestones.md` — kamienie milowe i zadania; po zakończeniu zadania odhacz `[x]`
- `supabase/migrations/` — schemat bazy; zmiany tylko nowymi migracjami, nigdy edycją starych

## Stos
Next.js 16 (App Router, TypeScript strict) · Tailwind + shadcn/ui · Supabase (Postgres + PostGIS, Auth, Storage, Realtime) · MapLibre GL · PWA kierowcy w `/driver` z Dexie (IndexedDB) · Vitest + Playwright · Vercel · Sentry.

## Struktura
```
src/
  app/                 # routing Next.js: (panel)/..., driver/..., api/...
  modules/<moduł>/
    domain/            # czyste funkcje i typy — BEZ importów z Next/Supabase; 100% testów
    server/            # serwisy, zapytania do bazy, akcje serwerowe
    ui/                # komponenty modułu
  lib/                 # supabase client, adaptery (geocoding, routing), utils
```
Moduły: tenancy, masterdata, orders, planning, execution, packaging, payroll, ops, growth.

## Zasady nienegocjowalne
1. Każda tabela biznesowa ma `tenant_id` i włączony RLS. Nowa tabela = polityki RLS w tej samej migracji + test, że tenant A nie widzi danych tenanta B.
2. `service_role` tylko po stronie serwera. Nigdy w kodzie klienta ani w `NEXT_PUBLIC_*`.
3. `delivery_events` i `packaging_movements` są append-only. Korekta = nowy zapis, nie UPDATE/DELETE.
4. Logika walidacji tras, kalkulatora wynagrodzeń i sald opakowań żyje w `modules/*/domain` jako czyste funkcje z testami jednostkowymi. UI tylko wywołuje.
5. Zewnętrzne API (geokodowanie, routing/VRP, ERP) wyłącznie przez adaptery w `src/lib/adapters/*` z interfejsem i implementacją fake do testów.
6. Aplikacja kierowcy działa offline: każda akcja to zdarzenie z `client_event_id` (UUID generowany na telefonie), zapis lokalny, synchronizacja idempotentna.
7. Kwoty: `numeric` w bazie, w TS liczone w groszach (integer) lub przez bibliotekę decimal — nigdy float.
8. Czas: w bazie `timestamptz`, w UI strefa Europe/Warsaw. Okna przyjęć to czas lokalny.

## Next.js 16 — ważne różnice (przeczytaj też `AGENTS.md`)
- Zamiast `middleware.ts` jest `src/proxy.ts` (odświeża sesję Supabase, przekierowuje niezalogowanych).
- `cookies()`, `headers()`, `params`, `searchParams` są wyłącznie asynchroniczne (`await`).
- Cache Components są **wyłączone** (ADR-8) — strony za logowaniem renderują się dynamicznie.
- Przed pisaniem kodu w nieznanym obszarze sprawdź dokumentację w `node_modules/next/dist/docs/`.

## Jak działa dostęp (zbudowane w M0)
- `src/modules/tenancy/domain/access.ts` — role, menu, `canAccess()`. Nowy ekran = wpis w `NAV_ITEMS`.
- Każda strona panelu zaczyna się od `const ctx = await requireAccess("/ścieżka")` — daje `tenantId`, rolę, e-mail.
- Zapytania zawsze z `.eq("tenant_id", ctx.tenantId)` (RLS chroni i tak, ale filtr wybiera bieżącą firmę, gdy użytkownik ma kilka).
- Firma demo: funkcja SQL `create_demo_tenant()` (migracja 0002), przycisk na `/wybierz-firme`.
- Typy bazy: `src/lib/supabase/database.types.ts` — po każdej migracji wygeneruj ponownie (`npm run db:types`).

## Komendy
`npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `npm run test:e2e`
Zmienne środowiskowe: patrz `.env.example`.

## Konwencje
- UI w języku polskim; kod, nazwy tabel i commitów po angielsku.
- Komponenty dopasowane do dyspozytora pracującego na dużym monitorze (gęste tabele, skróty klawiszowe) i kierowcy na telefonie jedną ręką (duże przyciski, min. 48 px).
- Po każdym zadaniu: `npm run lint && npm run typecheck && npm test` zielone, commit z odwołaniem do zadania (np. `M1.5: order import column mapping`).
- Gdy zadanie wymaga decyzji produktowej, której nie ma w dokumentach — zapytaj, nie zgaduj.
