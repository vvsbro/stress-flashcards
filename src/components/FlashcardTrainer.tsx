import { ArrowRight, Brain, Check, Gauge, Keyboard, Layers3, Target, Timer, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { recordAnswerInDb } from "../lib/progressApi";
import {
  StatsByWord,
  StressWord,
  TrainingMode,
  accuracy,
  getLearningSummary,
  getLetterChoices,
  getMemoryProfile,
  getPriorityQueue,
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

const trainingModes: Array<{ id: TrainingMode; label: string; description: string }> = [
  { id: "smart", label: "Умно", description: "баланс новых слов, ошибок и повторения" },
  { id: "mistakes", label: "Ошибки", description: "давит на слабые места" },
  { id: "new", label: "Новые", description: "быстро закрывает незнакомые слова" },
  { id: "exam", label: "Экзамен", description: "больше случайности, как в реальной проверке" },
];

const pickInitialWord = (stats: StatsByWord, mode: TrainingMode) => pickNextWord(stressWords, stats, [], mode);

const formatAccuracy = (value: number | null) => (value === null ? "нет попыток" : `${value}%`);

export function FlashcardTrainer({ stats, setStats }: FlashcardTrainerProps) {
  const [mode, setMode] = useState<TrainingMode>("smart");
  const [currentWord, setCurrentWord] = useState<StressWord>(() => pickInitialWord(stats, "smart"));
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<boolean | null>(null);
  const [cardStartedAt, setCardStartedAt] = useState(() => Date.now());

  const choices = useMemo(() => getLetterChoices(currentWord), [currentWord]);
  const vowelChoices = choices.filter((choice) => choice.isVowel);
  const currentStat = getWordStat(stats, currentWord.id);
  const currentProfile = getMemoryProfile(currentWord, stats, recentIds, mode);
  const topMistakes = getTopMistakes(stats, 4);
  const priorityQueue = getPriorityQueue(stats, mode, 5);
  const learningSummary = getLearningSummary(stats);
  const answered = selectedIndex !== null;

  useEffect(() => {
    if (!currentWord) setCurrentWord(pickInitialWord(stats, mode));
  }, [currentWord, mode, stats]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      if (answered && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        nextWord();
        return;
      }

      const number = Number(event.key);
      if (!answered && Number.isInteger(number) && number >= 1 && number <= vowelChoices.length) {
        event.preventDefault();
        chooseLetter(vowelChoices[number - 1].index);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answered, currentWord.id, mode, stats, vowelChoices]);

  const chooseLetter = async (index: number) => {
    if (answered) return;

    const isCorrect = index === currentWord.stressLetterIndex;
    const responseMs = Date.now() - cardStartedAt;
    const nextStats = recordAnswer(stats, currentWord.id, isCorrect, responseMs);

    setStats(nextStats);
    saveStats(nextStats);
    setSelectedIndex(index);
    setLastResult(isCorrect);

    try {
      const dbStats = await recordAnswerInDb(currentWord.id, isCorrect, responseMs);
      setStats(dbStats);
      saveStats(dbStats);
    } catch {
      saveStats(nextStats);
    }
  };

  const nextWord = () => {
    const nextRecentIds = [currentWord.id, ...recentIds].slice(0, 7);
    setRecentIds(nextRecentIds);
    setCurrentWord(pickNextWord(stressWords, stats, nextRecentIds, mode));
    setSelectedIndex(null);
    setLastResult(null);
    setCardStartedAt(Date.now());
  };

  const changeMode = (nextMode: TrainingMode) => {
    setMode(nextMode);
    setSelectedIndex(null);
    setLastResult(null);
    setCurrentWord(pickNextWord(stressWords, stats, recentIds, nextMode));
    setCardStartedAt(Date.now());
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
          <div className="mb-5 grid gap-2 sm:grid-cols-4">
            {trainingModes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => changeMode(item.id)}
                className={[
                  "rounded-md border px-3 py-3 text-left transition",
                  mode === item.id ? "border-teal-600 bg-teal-50 text-teal-950" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-1 block text-xs leading-4 text-stone-500">{item.description}</span>
              </button>
            ))}
          </div>

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
            <span className="rounded-md bg-teal-100 px-3 py-1 text-sm font-medium text-teal-900">
              {currentProfile.reason}, мастерство {currentProfile.mastery}%
            </span>
          </div>

          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-8 sm:px-6">
            <div className="flex min-h-24 flex-wrap items-end justify-center gap-1 sm:gap-2">
              {choices.map((choice) => {
                const isSelected = selectedIndex === choice.index;
                const isCorrectLetter = answered && choice.index === currentWord.stressLetterIndex;
                const isWrongSelection = isSelected && !isCorrectLetter;
                const vowelNumber = choice.isVowel ? choices.slice(0, choice.index + 1).filter((item) => item.isVowel).length : null;

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
                    {vowelNumber ? (
                      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-stone-400">{vowelNumber}</span>
                    ) : null}
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
              <p className="flex items-center gap-2 text-sm text-stone-600">
                <Keyboard className="h-4 w-4" />
                Нажимай мышкой или цифрами 1-{vowelChoices.length}. После ответа Enter или пробел.
              </p>
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
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
            <Brain className="h-4 w-4 text-teal-700" />
            Память
          </h2>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${currentProfile.mastery}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <StatTile label="Новые" value={learningSummary.new} />
            <StatTile label="Срочно" value={learningSummary.urgent} tone="bad" />
            <StatTile label="Слабые" value={learningSummary.weak} tone="bad" />
            <StatTile label="Знаешь" value={learningSummary.mastered} tone="good" />
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
            <Gauge className="h-4 w-4 text-teal-700" />
            Текущая статистика
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatTile label="Попытки" value={currentStat.attempts} />
            <StatTile label="Верно" value={currentStat.correct} tone="good" />
            <StatTile label="Ошибки" value={currentStat.wrong} tone="bad" />
          </div>
          {currentStat.averageResponseMs ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-stone-600">
              <Timer className="h-4 w-4" />
              Средний ответ: {(currentStat.averageResponseMs / 1000).toFixed(1)} сек.
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
            <Zap className="h-4 w-4 text-amber-600" />
            Следующие по приоритету
          </h2>
          <div className="mt-4 space-y-2">
            {priorityQueue.map(({ word, profile }) => (
              <div key={word.id} className="flex items-center justify-between gap-3 rounded-md bg-stone-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-950">{word.answer}</p>
                  <p className="text-xs text-stone-500">{profile.reason}</p>
                </div>
                <span className="rounded-md bg-teal-100 px-2 py-1 text-xs font-semibold text-teal-800">{profile.mastery}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
            <Layers3 className="h-4 w-4 text-rose-600" />
            Частые ошибки
          </h2>
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
