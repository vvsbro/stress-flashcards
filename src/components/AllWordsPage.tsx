import { AlertTriangle, BarChart3 } from "lucide-react";
import { useMemo } from "react";
import { StatsByWord, accuracy, getTopMistakes, getWordStat, stressWords } from "../lib/stress";

type AllWordsPageProps = {
  stats: StatsByWord;
};

const formatAccuracy = (value: number | null) => (value === null ? "нет попыток" : `${value}%`);

const mistakeScore = (wordId: string, stats: StatsByWord) => {
  const stat = getWordStat(stats, wordId);
  if (stat.attempts === 0) return -1;
  return stat.wrong * 100 + Math.round((stat.wrong / stat.attempts) * 100);
};

export function AllWordsPage({ stats }: AllWordsPageProps) {
  const topMistakes = getTopMistakes(stats, 8);
  const sortedWords = useMemo(() => {
    return [...stressWords].sort((a, b) => {
      const byScore = mistakeScore(b.id, stats) - mistakeScore(a.id, stats);
      if (byScore !== 0) return byScore;
      return a.plain.localeCompare(b.plain, "ru");
    });
  }, [stats]);

  const attempted = stressWords.filter((word) => getWordStat(stats, word.id).attempts > 0).length;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Все слова</p>
            <h1 className="mt-1 text-xl font-semibold text-stone-950 sm:text-2xl">Список с процентом правильности</h1>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-700">
            <BarChart3 className="h-4 w-4 text-teal-700" />
            <span>
              {stressWords.length} всего, {attempted} уже были
            </span>
          </div>
        </div>

        <div className="mt-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Где чаще ошибаешься
          </h2>
          {topMistakes.length === 0 ? (
            <p className="mt-3 rounded-md bg-stone-50 px-3 py-3 text-sm text-stone-600">Ошибок пока нет, блок заполнится после тренировки.</p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {topMistakes.map(({ word, stat }) => (
                <div key={word.id} className="rounded-md border border-rose-100 bg-rose-50 px-3 py-3">
                  <p className="truncate font-semibold text-rose-950">{word.answer}</p>
                  <p className="mt-1 text-sm text-rose-800">
                    {stat.wrong} ошибок, {formatAccuracy(accuracy(stat))} правильно
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="grid grid-cols-[72px_minmax(0,1fr)_112px_96px] gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
          <span>Буква</span>
          <span>Слово</span>
          <span>Точность</span>
          <span>Ошибки</span>
        </div>
        <div className="divide-y divide-stone-100">
          {sortedWords.map((word) => {
            const stat = getWordStat(stats, word.id);
            const wordAccuracy = accuracy(stat);

            return (
              <div
                key={word.id}
                className="grid grid-cols-[72px_minmax(0,1fr)_112px_96px] items-center gap-3 px-4 py-3 text-sm transition hover:bg-teal-50/60"
              >
                <span className="font-semibold text-stone-500">{word.letter}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-950">{word.answer}</p>
                  {word.note ? <p className="truncate text-xs text-stone-500">{word.note}</p> : null}
                </div>
                <span className={wordAccuracy === null ? "text-stone-500" : wordAccuracy >= 80 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
                  {formatAccuracy(wordAccuracy)}
                </span>
                <span className="text-stone-700">{stat.wrong}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
