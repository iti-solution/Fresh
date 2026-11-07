import { describe, expect, it } from "vitest";
import {
  autoPanels,
  hasProblems,
  matchesFilter,
  outsideWindow,
  parseBoardView,
  planEtas,
  sortRoutes,
  splitIntoPanels,
  DEFAULT_BOARD_VIEW,
  type BoardRouteLike,
} from "./board";

const stop = (id: string, sequence: number, extra: Partial<Parameters<typeof planEtas>[1][number]> = {}) => ({
  id,
  sequence,
  status: "pending",
  windowStart: null,
  windowEnd: null,
  arrivedAt: null,
  completedAt: null,
  ...extra,
});

describe("planEtas", () => {
  it("liczy od wyjazdu: pierwszy odcinek + stały czas na punkt", () => {
    const e = planEtas("06:00", [stop("a", 1), stop("b", 2), stop("c", 3)]);
    expect([e.get("a"), e.get("b"), e.get("c")]).toEqual(["06:35", "06:59", "07:23"]);
  });
  it("czeka na okno: nie wcześniej niż kwadrans przed otwarciem", () => {
    const e = planEtas("06:00", [stop("a", 1, { windowStart: "08:00" }), stop("b", 2)]);
    expect(e.get("a")).toBe("07:45");
    expect(e.get("b")).toBe("08:09");
  });
  it("po zrealizowanym punkcie liczy od jego godziny", () => {
    const e = planEtas("06:00", [stop("a", 1, { status: "delivered", completedAt: "07:10" }), stop("b", 2)]);
    expect(e.get("a")).toBe("07:10");
    expect(e.get("b")).toBe("07:34");
  });
  it("dzisiaj nie prognozuje w przeszłości", () => {
    const e = planEtas("06:00", [stop("a", 1)], "09:00");
    expect(e.get("a")).toBe("09:35");
  });
  it("bez godziny wyjazdu przyjmuje 06:00", () => {
    expect(planEtas(null, [stop("a", 1)]).get("a")).toBe("06:35");
  });
});

describe("outsideWindow", () => {
  it("zgłasza dojazd po zamknięciu okna", () => {
    expect(outsideWindow("08:00", "08:10")).toBe(true);
    expect(outsideWindow("08:00", "07:59")).toBe(false);
    expect(outsideWindow(null, "09:00")).toBe(false);
  });
});

const route = (name: string, extra: Partial<BoardRouteLike> = {}): BoardRouteLike => ({
  name,
  status: "draft",
  plannedStart: "06:00",
  stopsCount: 5,
  outOfWindow: 0,
  overloaded: false,
  missingResource: false,
  maxLoadPct: 50,
  ...extra,
});

describe("trasy", () => {
  it("problem = przeciążenie, brak zasobu albo poza oknem", () => {
    expect(hasProblems(route("A"))).toBe(false);
    expect(hasProblems(route("A", { outOfWindow: 1 }))).toBe(true);
    expect(hasProblems(route("A", { overloaded: true }))).toBe(true);
    expect(hasProblems(route("A", { missingResource: true }))).toBe(true);
  });
  it("sortuje po nazwie naturalnie i po liczbie punktów", () => {
    const rs = [route("Trasa 10"), route("Trasa 2", { stopsCount: 9 }), route("Trasa 1")];
    expect(sortRoutes(rs, "name").map((r) => r.name)).toEqual(["Trasa 1", "Trasa 2", "Trasa 10"]);
    expect(sortRoutes(rs, "stops")[0].name).toBe("Trasa 2");
  });
  it("najpierw problemy", () => {
    const rs = [route("A"), route("B", { overloaded: true })];
    expect(sortRoutes(rs, "problems")[0].name).toBe("B");
  });
  it("filtry statusów", () => {
    expect(matchesFilter(route("A", { status: "in_progress" }), "on_road")).toBe(true);
    expect(matchesFilter(route("A", { status: "planned" }), "ready")).toBe(true);
    expect(matchesFilter(route("A", { status: "closed" }), "done")).toBe(true);
    expect(matchesFilter(route("A"), "problems")).toBe(false);
  });
});

describe("widok", () => {
  it("odczytuje zapisane ustawienia i odrzuca śmieci", () => {
    expect(parseBoardView(null)).toEqual(DEFAULT_BOARD_VIEW);
    const v = parseBoardView({ layout: "columns", panels: 3, show: { eta: false, x: 1 } });
    expect(v.layout).toBe("columns");
    expect(v.panels).toBe(3);
    expect(v.show.eta).toBe(false);
    expect(v.show.phone).toBe(true);
    expect(parseBoardView({ panels: 9 }).panels).toBe("auto");
  });
  it("dzieli trasy na panele po kolei", () => {
    expect(splitIntoPanels([1, 2, 3, 4, 5], 2)).toEqual([[1, 2, 3], [4, 5]]);
    expect(splitIntoPanels([], 3)).toEqual([[], [], []]);
  });
  it("liczba paneli wg szerokości", () => {
    expect(autoPanels(1000)).toBe(1);
    expect(autoPanels(1440)).toBe(2);
    expect(autoPanels(1920)).toBe(3);
  });
});
