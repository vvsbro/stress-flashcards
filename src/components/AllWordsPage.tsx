import { AlertTriangle, BarChart3, Brain, Clock3 } from "lucide-react";
import { useMemo } from "react";
import { StatsByWord, accuracy, getLearningSummary, getMemoryProfile, getTopMistakes, getWordStat, stressWords } from "../lib/stress";

type AllWordsPageProps = {
  stats: StatsByWord;
};

const formatAccuracy = (value: number | null) => (value === null ? "нет попыток" : `${value}%`);

const mistakeScore = (wordId: string, stats: StatsByWord) => {
  const stat = getWordStat(stats, wordId);
  if (stat.attempts === 0) return -1;
  return stat.wrong * 100 + Math.round((stat.wrong / stat.attempts) * 100);
};

const bucketLabel = {
  new: "новое",
  urgent: "срочно",
  weak: "слабое",
  learning: "учится",
  mastered: "знаешь",
};

const bucketClass = {
  new: "bg-sky-50 text-sky-800",
  urgent: "bg-rose-50 text-rose-800",
  weak: "bg-amber-50 text-amber-800",
  learning: "bg-teal-50 text-teal-800",
  mastered: "bg-emerald-50 text-emerald-800",
};

export function AllWordsPage({ stats }: AllWordsPageProps) {
  const topMistakes = getTopMistakes(stats, 8);
  const summary = getLearningSummary(stats);
  const sortedWords = useMemo(() => {
    return [...stressWords].sort((a, b) => {
      const aProfile = getMemoryProfile(a, stats);
      const bProfile = getMemoryProfile(b, stats);
      const byPriority = bProfile.priority - aProfile.priority;
      if (byPriority !== 0) return byPriority;

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

        <div className="mt-5 grid gap-2 sm:grid-cols-5">
          <SummaryTile label="Новые" value={summary.new} />
          <SummaryTile label="Срочно" value={summary.urgent} tone="bad" />
          <SummaryTile label="Слабые" value={summary.weak} tone="warn" />
          <SummaryTile label="В процессе" value={summary.learning} />
          <SummaryTile label="Знаешь" value={summary.mastered} tone="good" />
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

      <section className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="grid min-w-[720px] grid-cols-[60px_minmax(0,1fr)_96px_96px_96px] gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
          <span>Буква</span>
          <span>Слово</span>
          <span>Точность</span>
          <span>Память</span>
          <span>Статус</span>
        </div>
        <div className="divide-y divide-stone-100">
          {sortedWords.map((word) => {
            const stat = getWordStat(stats, word.id);
            const wordAccuracy = accuracy(stat);
            const profile = getMemoryProfile(word, stats);

            return (
              <div
                key={word.id}
                className="grid min-w-[720px] grid-cols-[60px_minmax(0,1fr)_96px_96px_96px] items-center gap-3 px-4 py-3 text-sm transition hover:bg-teal-50/60"
              >
                <span className="font-semibold text-stone-500">{word.letter}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-950">{word.answer}</p>
                  <p className="truncate text-xs text-stone-500">{word.note ?? profile.reason}</p>
                </div>
                <span className={wordAccuracy === null ? "text-stone-500" : wordAccuracy >= 80 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
                  {formatAccuracy(wordAccuracy)}
                </span>
                <span className="flex items-center gap-1 text-stone-700">
                  <Brain className="h-3.5 w-3.5 text-teal-700" />
                  {profile.mastery}%
                </span>
                <span className={`rounded-md px-2 py-1 text-center text-xs font-semibold ${bucketClass[profile.bucket]}`}>
                  {bucketLabel[profile.bucket]}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SummaryTile({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "good" | "bad" | "warn" }) {
  const toneClass = {
    neutral: "bg-stone-50 text-stone-800",
    good: "bg-emerald-50 text-emerald-800",
    bad: "bg-rose-50 text-rose-800",
    warn: "bg-amber-50 text-amber-800",
  }[tone];

  return (
    <div className={`rounded-md px-3 py-3 ${toneClass}`}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em]">
        <Clock3 className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
