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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:px-5 lg:px-8">
        <header className="rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">ЕГЭ, задание 4</p>
              <h1 className="mt-1 text-2xl font-semibold text-stone-950">Тренажер ударений</h1>
              <p className="mt-1 text-sm text-stone-500">
                Прогресс: {storageMode === "database" ? "data/progress.db" : "локально в браузере"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <nav className="grid grid-cols-2 rounded-md bg-stone-100 p-1">
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
    </main>
  );
}
