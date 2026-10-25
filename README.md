# Fresh

TMS dla hurtowni owoców i warzyw obsługujących HoReCa własną flotą: planowanie tras, aplikacja kierowcy, opakowania zwrotne, rozliczenia kierowców.

- Architektura: `docs/01-architektura.md`
- Zakres MVP: `docs/02-zakres-mvp.md`
- Model danych: `docs/03-model-danych.md`, `supabase/migrations/`
- Plan prac: `docs/04-plan-milestones.md`
- Instrukcje dla Claude Code: `CLAUDE.md`

## Uruchomienie lokalne
1. Node.js 22+, `npm install`
2. Skopiuj `.env.example` → `.env.local` i uzupełnij klucze z Supabase
3. `npm run dev` → http://localhost:3000
