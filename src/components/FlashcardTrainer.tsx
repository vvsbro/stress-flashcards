import { ArrowRight, Check, Target, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { recordAnswerInDb } from "../lib/progressApi";
import {
  StatsByWord,
  StressWord,
  accuracy,
  getLetterChoices,
  getTopMistakes,
  getWordStat,
  pickNextWord,
  recordAnswer,
  saveStats,
  stressWords,
} from "../lib/stress";

type FlashcardTrainerProps = {
  stats: StatsByWord;
  setStats: (stats: StatsByWord) => void;
};

const pickInitialWord = (stats: StatsByWord) => pickNextWord(stressWords, stats, []);

const formatAccuracy = (value: number | null) => (value === null ? "нет попыток" : `${value}%`);

export function FlashcardTrainer({ stats, setStats }: FlashcardTrainerProps) {
  const [currentWord, setCurrentWord] = useState<StressWord>(() => pickInitialWord(stats));
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<boolean | null>(null);

  const choices = useMemo(() => getLetterChoices(currentWord), [currentWord]);
  const currentStat = getWordStat(stats, currentWord.id);
  const topMistakes = getTopMistakes(stats, 4);
  const answered = selectedIndex !== null;

  useEffect(() => {
    if (!currentWord) setCurrentWord(pickInitialWord(stats));
  }, [currentWord, stats]);

  const chooseLetter = async (index: number) => {
    if (answered) return;

    const isCorrect = index === currentWord.stressLetterIndex;
    const nextStats = recordAnswer(stats, currentWord.id, isCorrect);

    setStats(nextStats);
    saveStats(nextStats);
    setSelectedIndex(index);
    setLastResult(isCorrect);

    try {
      const dbStats = await recordAnswerInDb(currentWord.id, isCorrect);
      setStats(dbStats);
      saveStats(dbStats);
    } catch {
      saveStats(nextStats);
    }
  };

  const nextWord = () => {
    const nextRecentIds = [currentWord.id, ...recentIds].slice(0, 7);
    setRecentIds(nextRecentIds);
    setCurrentWord(pickNextWord(stressWords, stats, nextRecentIds));
    setSelectedIndex(null);
    setLastResult(null);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Флэшкарта</p>
            <h1 className="mt-1 text-xl font-semibold text-stone-950 sm:text-2xl">Выбери ударную гласную</h1>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-700">
            <Target className="h-4 w-4 text-teal-700" />
            <span>{stressWords.length} слов всего</span>
          </div>
        </div>

        <div className="px-4 py-6 sm:px-6 sm:py-8">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">
              Буква {currentWord.letter}
            </span>
            {currentWord.note ? (
              <span className="rounded-md bg-teal-50 px-3 py-1 text-sm font-medium text-teal-900">
                {currentWord.note}
              </span>
            ) : null}
            <span className="rounded-md bg-stone-100 px-3 py-1 text-sm text-stone-700">
              точность: {formatAccuracy(accuracy(currentStat))}
            </span>
          </div>

          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-8 sm:px-6">
            <div className="flex min-h-24 flex-wrap items-end justify-center gap-1 sm:gap-2">
              {choices.map((choice) => {
                const isSelected = selectedIndex === choice.index;
                const isCorrectLetter = answered && choice.index === currentWord.stressLetterIndex;
                const isWrongSelection = isSelected && !isCorrectLetter;

                return (
                  <button
                    key={`${currentWord.id}-${choice.index}`}
                    type="button"
                    disabled={!choice.isVowel || answered}
                    onClick={() => chooseLetter(choice.index)}
                    className={[
                      "relative flex h-16 min-w-10 items-center justify-center rounded-md border px-2 text-4xl font-semibold transition sm:h-20 sm:min-w-12 sm:text-5xl",
                      choice.isVowel
                        ? "border-stone-300 bg-white text-stone-950 hover:-translate-y-0.5 hover:border-teal-500 hover:bg-teal-50"
                        : "border-transparent bg-transparent text-stone-400",
                      isCorrectLetter ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "",
                      isWrongSelection ? "border-rose-500 bg-rose-50 text-rose-800" : "",
                    ].join(" ")}
                    aria-label={choice.isVowel ? `Выбрать букву ${choice.char}` : undefined}
                  >
                    {isSelected || isCorrectLetter ? (
                      <span
                        className={[
                          "absolute -top-5 left-1/2 h-5 w-2 -translate-x-1/2 rounded-full",
                          isCorrectLetter ? "animate-[drop_220ms_ease-out] bg-emerald-500" : "animate-[drop_220ms_ease-out] bg-rose-500",
                        ].join(" ")}
                      />
                    ) : null}
                    {choice.char}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 flex min-h-16 flex-wrap items-center justify-between gap-3">
            {lastResult === null ? (
              <p className="text-sm text-stone-600">Нажимай на гласную, на которую падает ударение.</p>
            ) : (
              <div
                className={[
                  "flex items-center gap-3 rounded-md px-3 py-2",
                  lastResult ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800",
                ].join(" ")}
              >
                {lastResult ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                <span className="font-medium">
                  {lastResult ? "Правильно" : "Ошибка"}: {currentWord.answer}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={nextWord}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              disabled={!answered}
            >
              <span>Дальше</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">Текущая статистика</h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatTile label="Попытки" value={currentStat.attempts} />
            <StatTile label="Верно" value={currentStat.correct} tone="good" />
            <StatTile label="Ошибки" value={currentStat.wrong} tone="bad" />
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">Частые ошибки</h2>
          {topMistakes.length === 0 ? (
            <p className="mt-4 text-sm text-stone-600">Ошибок пока нет.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {topMistakes.map(({ word, stat }) => (
                <div key={word.id} className="flex items-center justify-between gap-3 rounded-md bg-stone-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-stone-950">{word.answer}</p>
                    <p className="text-xs text-stone-500">{formatAccuracy(accuracy(stat))} правильно</p>
                  </div>
                  <span className="rounded-md bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">{stat.wrong}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function StatTile({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "good" | "bad" }) {
  const toneClass = {
    neutral: "bg-stone-100 text-stone-900",
    good: "bg-emerald-50 text-emerald-800",
    bad: "bg-rose-50 text-rose-800",
  }[tone];

  return (
    <div className={`rounded-md px-3 py-3 text-center ${toneClass}`}>
      <div className="text-lg font-semibold">{value}</div>
      <div className="mt-1 text-xs">{label}</div>
    </div>
  );
}
