import { BookOpen, Flame, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { AllWordsPage } from "./components/AllWordsPage";
import { FlashcardTrainer } from "./components/FlashcardTrainer";
import { fetchStatsFromDb, resetDbStats } from "./lib/progressApi";
import { loadStats, saveStats, type StatsByWord } from "./lib/stress";

type Page = "trainer" | "words";

export function App() {
  const [page, setPage] = useState<Page>("trainer");
  const [stats, setStats] = useState<StatsByWord>(() => loadStats());
  const [storageMode, setStorageMode] = useState<"database" | "local">("local");

  useEffect(() => {
    let cancelled = false;

    fetchStatsFromDb()
      .then((dbStats) => {
        if (cancelled) return;
        setStats(dbStats);
        saveStats(dbStats);
        setStorageMode("database");
      })
      .catch(() => {
        if (!cancelled) setStorageMode("local");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const resetStats = async () => {
    const confirmed = window.confirm("Сбросить всю статистику ответов?");
    if (!confirmed) return;

    setStats({});
    saveStats({});

    try {
      await resetDbStats();
      setStorageMode("database");
    } catch {
      setStorageMode("local");
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f6f3]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 pb-24 pt-3 sm:gap-5 sm:px-5 sm:py-4 lg:px-8">
        <header className="rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">ЕГЭ, задание 4</p>
              <h1 className="mt-1 truncate text-xl font-semibold text-stone-950 sm:text-2xl">Тренажер ударений</h1>
              <p className="mt-1 truncate text-xs text-stone-500 sm:text-sm">
                Прогресс: {storageMode === "database" ? "data/progress.db" : "локально в браузере"}
              </p>
            </div>

            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <nav className="grid grid-cols-2 rounded-md bg-stone-100 p-1" aria-label="Основная навигация">
                <button
                  type="button"
                  onClick={() => setPage("trainer")}
                  className={[
                    "inline-flex h-10 items-center justify-center gap-2 rounded px-3 text-sm font-semibold transition",
                    page === "trainer" ? "bg-white text-stone-950 shadow-sm" : "text-stone-600 hover:text-stone-950",
                  ].join(" ")}
                >
                  <Flame className="h-4 w-4" />
                  <span>Флэшкарты</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPage("words")}
                  className={[
                    "inline-flex h-10 items-center justify-center gap-2 rounded px-3 text-sm font-semibold transition",
                    page === "words" ? "bg-white text-stone-950 shadow-sm" : "text-stone-600 hover:text-stone-950",
                  ].join(" ")}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Все слова</span>
                </button>
              </nav>

              <button
                type="button"
                onClick={resetStats}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                title="Сбросить статистику"
                aria-label="Сбросить статистику"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {page === "trainer" ? <FlashcardTrainer stats={stats} setStats={setStats} /> : <AllWordsPage stats={stats} />}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 shadow-[0_-10px_30px_rgba(28,25,23,0.08)] backdrop-blur sm:hidden" aria-label="Мобильная навигация">
        <div className="mx-auto grid max-w-md grid-cols-[1fr_1fr_52px] gap-2">
          <button
            type="button"
            onClick={() => setPage("trainer")}
            className={[
              "inline-flex h-12 items-center justify-center gap-2 rounded-md text-sm font-semibold transition",
              page === "trainer" ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-700",
            ].join(" ")}
          >
            <Flame className="h-4 w-4" />
            <span>Карты</span>
          </button>
          <button
            type="button"
            onClick={() => setPage("words")}
            className={[
              "inline-flex h-12 items-center justify-center gap-2 rounded-md text-sm font-semibold transition",
              page === "words" ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-700",
            ].join(" ")}
          >
            <BookOpen className="h-4 w-4" />
            <span>Слова</span>
          </button>
          <button
            type="button"
            onClick={resetStats}
            className="inline-flex h-12 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600"
            title="Сбросить статистику"
            aria-label="Сбросить статистику"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </nav>
    </main>
  );
}
