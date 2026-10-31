// Adapter rozpoznawania zamówień (zasada 5 w CLAUDE.md): interfejs + implementacje.
// - rules: słownik + katalog, bez sieci (domyślny, także atrapa do testów)
// - claude: model językowy Anthropic, gdy ustawiono ANTHROPIC_API_KEY; przy błędzie wraca do rules
// Wynik każdej implementacji idzie do kolejki „Do sprawdzenia” — nigdy prosto do zamówień.
import "server-only";
import {
  parseOrderText,
  toParsedOrder,
  type AliasEntry,
  type CatalogEntry,
  type ModelOutput,
  type ParsedOrder,
} from "@/modules/intake/domain/parse";

export type ParseInput = { text: string; catalog: CatalogEntry[]; aliases: AliasEntry[]; today: string };

export interface OrderParser {
  /** Nazwa zapisywana przy szkicu — pozwala porównać skuteczność wersji. */
  readonly name: string;
  /** Wynik + nazwa implementacji, która go faktycznie dała (po awarii AI — „rules”). */
  parse(input: ParseInput): Promise<ParsedOrder & { parser: string }>;
}

export const rulesParser: OrderParser = {
  name: "rules",
  async parse({ text, catalog, aliases, today }) {
    return { ...parseOrderText(text, catalog, aliases, today), parser: "rules" };
  },
};

const DAYS = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];

const TOOL = {
  name: "zapisz_zamowienie",
  description: "Zapisuje zamówienie odczytane z wiadomości klienta hurtowni.",
  input_schema: {
    type: "object",
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            phrase: {
              type: "string",
              description: "Dokładny fragment wiadomości, skopiowany znak w znak, którego dotyczy pozycja",
            },
            product_id: {
              type: ["string", "null"],
              description: "id produktu z katalogu albo null, gdy nie ma pewnego dopasowania",
            },
            qty: {
              type: ["number", "null"],
              description: "Ilość w jednostce katalogu (po autokorekcie klienta — ostatnia podana)",
            },
            unit: { type: ["string", "null"], description: "Jednostka użyta przez klienta: kg, skrz, szt, opak, pecz" },
            confidence: { type: "number", description: "Pewność 0–1" },
          },
          required: ["phrase", "product_id", "qty", "unit", "confidence"],
        },
      },
      delivery_date: { type: ["string", "null"], description: "Dzień dostawy YYYY-MM-DD, jeśli klient go podał" },
      note: { type: ["string", "null"], description: "Uwagi dla dostawy/kierowcy z wiadomości, jeśli są" },
    },
    required: ["lines", "delivery_date", "note"],
  },
} as const;

function claudeParser(apiKey: string, model: string): OrderParser {
  return {
    name: `claude:${model}`,
    async parse(input) {
      const { text, catalog, aliases, today } = input;
      const wd = DAYS[new Date(`${today}T12:00:00Z`).getUTCDay()];
      const catalogList = catalog.map((p) => `${p.id} | ${p.name} | ${p.unit}`).join("\n");
      const aliasList = aliases
        .map((a) => {
          const p = catalog.find((c) => c.id === a.product_id);
          return p ? `${a.alias_key} → ${p.id} (${p.name})` : null;
        })
        .filter(Boolean)
        .join("\n");
      const system =
        "Odczytujesz zamówienia restauracji składane hurtowni owoców i warzyw (SMS, e-mail, WhatsApp, transkrypcje rozmów, po polsku, czasem po ukraińsku lub angielsku). " +
        "Dopasowujesz pozycje wyłącznie do produktów z katalogu. Nie wymyślasz produktów ani ilości. Gdy klient się poprawia, bierzesz ostateczną wersję. " +
        "Ilość podajesz w jednostce katalogu (kg może być ułamkiem; skrzynki, sztuki, opakowania i pęczki w całych liczbach). " +
        "Gdy nie masz pewności, ustaw niską pewność albo product_id = null — człowiek i tak sprawdzi każde zamówienie. " +
        "Pole phrase musi być dokładnym fragmentem wiadomości.";
      const user =
        `Dziś jest ${today} (${wd}).\n\nKATALOG (id | nazwa | jednostka):\n${catalogList}\n\n` +
        (aliasList ? `JAK TEN KLIENT NAZYWA PRODUKTY (zatwierdzone wcześniej):\n${aliasList}\n\n` : "") +
        `WIADOMOŚĆ:\n"""\n${text}\n"""`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          system,
          tools: [TOOL],
          tool_choice: { type: "tool", name: TOOL.name },
          messages: [{ role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
      const body = (await res.json()) as { content?: { type: string; input?: ModelOutput }[] };
      const out = body.content?.find((c) => c.type === "tool_use")?.input;
      if (!out || !Array.isArray(out.lines)) throw new Error("Brak wyniku narzędzia");
      return { ...toParsedOrder(out, text, catalog), parser: `claude:${model}` };
    },
  };
}

/** Wybór implementacji. Bez klucza — słownik; z kluczem — Claude, a przy błędzie sieci słownik. */
export function getOrderParser(): OrderParser {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return rulesParser;
  const ai = claudeParser(key, process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5");
  return {
    name: ai.name,
    async parse(input) {
      try {
        return await ai.parse(input);
      } catch (e) {
        console.error("Rozpoznawanie AI nie powiodło się — używam słownika", e);
        return rulesParser.parse(input);
      }
    },
  };
}
