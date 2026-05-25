import { ArrowRight, Brain, Check, Layers3, Repeat2, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { taskOneCards, taskOneDomains, taskOneGroups, type TaskOneDomain, type TaskOneGroup } from "../data/taskOneTraining";

type TaskOneMode = "recall" | "classify" | "reverse" | "mixed";
type QuizMode = "classify" | "reverse";

type TaskOneStat = {
  attempts: number;
  correct: number;
  wrong: number;
  streak: number;
};

type TaskOneStats = Record<string, TaskOneStat>;

type Round = {
  mode: QuizMode;
  card: (typeof taskOneCards)[number];
  options: string[];
  answer: string;
};

const STORAGE_KEY = "task-one-trainer:v1";
const AUTO_NEXT_CORRECT_MS = 950;
const AUTO_NEXT_WRONG_MS = 2600;

const modes: Array<{ id: TaskOneMode; label: string }> = [
  { id: "recall", label: "Вспомни" },
  { id: "classify", label: "Разряд" },
  { id: "reverse", label: "Пример" },
  { id: "mixed", label: "Блиц" },
];

const domains: Array<{ id: "all" | TaskOneDomain; label: string }> = [
  { id: "all", label: "Всё" },
  { id: "pronouns", label: "Местоимения" },
  { id: "coordinating", label: "Сочинит." },
  { id: "subordinating", label: "Подчинит." },
  { id: "adverbs", label: "Наречия" },
  { id: "intro", label: "Вводные" },
];

const shuffle = <T,>(items: T[]) => {
  return [...items].sort(() => Math.random() - 0.5);
};

const emptyStat = (): TaskOneStat => ({ attempts: 0, correct: 0, wrong: 0, streak: 0 });

const loadStats = (): TaskOneStats => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TaskOneStats;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const saveStats = (stats: TaskOneStats) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
};

const getStat = (stats: TaskOneStats, id: string) => stats[id] ?? emptyStat();

const getAccuracy = (stat: TaskOneStat) => {
  if (stat.attempts === 0) return null;
  return Math.round((stat.correct / stat.attempts) * 100);
};

const pickWeighted = (cards: typeof taskOneCards, stats: TaskOneStats) => {
  const weighted = cards.map((card) => {
    const stat = getStat(stats, card.id);
    const wrongRate = stat.attempts === 0 ? 0 : stat.wrong / stat.attempts;
    const weight = card.priority * (4 + (stat.attempts === 0 ? 7 : 0) + stat.wrong * 5 + wrongRate * 9 - Math.max(stat.streak, 0) * 0.8);
    return { card, weight: Math.max(0.8, weight) };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * total;

  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.card;
  }

  return weighted[weighted.length - 1].card;
};

const pickWeightedGroup = (groups: TaskOneGroup[], stats: TaskOneStats, repairQueue: string[]) => {
  const repairGroupId = repairQueue.find((groupId) => groups.some((group) => group.id === groupId));
  if (repairGroupId !== undefined) {
    return groups.find((group) => group.id === repairGroupId)!;
  }

  const weighted = groups.map((group) => {
    const stat = getStat(stats, `group:${group.id}`);
    const wrongRate = stat.attempts === 0 ? 0 : stat.wrong / stat.attempts;
    const sizePressure = Math.min(group.items.length, 8) * 0.75;
    const weight = (group.priority ?? 1) * (5 + sizePressure + (stat.attempts === 0 ? 8 : 0) + stat.wrong * 6 + wrongRate * 12 - Math.max(stat.streak, 0));
    return { group, weight: Math.max(1, weight) };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * total;

  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.group;
  }

  return weighted[weighted.length - 1].group;
};

const buildRoundForCard = (card: (typeof taskOneCards)[number], mode: Exclude<TaskOneMode, "recall">, domain: "all" | TaskOneDomain): Round => {
  const cards = taskOneCards.filter((card) => domain === "all" || card.domain === domain);
  const realMode = mode === "mixed" ? (Math.random() > 0.5 ? "classify" : "reverse") : mode;

  if (realMode === "reverse") {
    const wrongItems = shuffle(cards.filter((candidate) => candidate.groupId !== card.groupId).map((candidate) => candidate.item)).slice(0, 3);
    return {
      mode: "reverse",
      card,
      options: shuffle([card.item, ...wrongItems]),
      answer: card.item,
    };
  }

  const groups = taskOneGroups.filter((group) => domain === "all" || group.domain === domain);
  const wrongGroups = shuffle(groups.filter((group) => group.id !== card.groupId).map((group) => group.title)).slice(0, 3);
  return {
    mode: "classify",
    card,
    options: shuffle([card.groupTitle, ...wrongGroups]),
    answer: card.groupTitle,
  };
};

const buildRound = (mode: TaskOneMode, domain: "all" | TaskOneDomain, stats: TaskOneStats, repairQueue: string[] = []): { round: Round; repairQueue: string[] } => {
  const cards = taskOneCards.filter((card) => domain === "all" || card.domain === domain);
  const repairCardId = repairQueue.find((cardId) => cards.some((card) => card.id === cardId));
  const card = repairCardId === undefined ? pickWeighted(cards, stats) : cards.find((candidate) => candidate.id === repairCardId)!;
  const nextRepairQueue = repairCardId === undefined ? repairQueue : repairQueue.filter((cardId, index) => cardId !== repairCardId || index !== repairQueue.indexOf(repairCardId));

  return { round: buildRoundForCard(card, mode === "recall" ? "mixed" : mode, domain), repairQueue: nextRepairQueue };
};

const getVisibleGroups = (domain: "all" | TaskOneDomain) => taskOneGroups.filter((group) => domain === "all" || group.domain === domain);

const normalizeRecall = (value: string) =>
  value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^а-яa-z0-9]+/gi, "");

const checkRecallAnswer = (input: string, group: TaskOneGroup) => {
  const compactInput = normalizeRecall(input);
  const found = group.items.filter((item) => compactInput.includes(normalizeRecall(item)));
  const missing = group.items.filter((item) => !compactInput.includes(normalizeRecall(item)));
  const score = Math.round((found.length / group.items.length) * 100);

  return { found, missing, score, isPerfect: missing.length === 0 };
};

export function TaskOneTrainer() {
  const [mode, setMode] = useState<TaskOneMode>("recall");
  const [domain, setDomain] = useState<"all" | TaskOneDomain>("pronouns");
  const [stats, setStats] = useState<TaskOneStats>(() => loadStats());
  const [round, setRound] = useState<Round>(() => buildRound("mixed", "pronouns", loadStats()).round);
  const [recallGroup, setRecallGroup] = useState<TaskOneGroup>(() => pickWeightedGroup(getVisibleGroups("pronouns"), loadStats(), []));
  const [recallInput, setRecallInput] = useState("");
  const [recallResult, setRecallResult] = useState<ReturnType<typeof checkRecallAnswer> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [repairQueue, setRepairQueue] = useState<string[]>([]);
  const [recallRepairQueue, setRecallRepairQueue] = useState<string[]>([]);
  const timerRef = useRef<number | null>(null);

  const visibleCards = useMemo(() => taskOneCards.filter((card) => domain === "all" || card.domain === domain), [domain]);
  const visibleGroups = useMemo(() => getVisibleGroups(domain), [domain]);
  const currentStat = getStat(stats, mode === "recall" ? `group:${recallGroup.id}` : round.card.id);
  const totalAttempts = Object.values(stats).reduce((sum, stat) => sum + stat.attempts, 0);
  const totalCorrect = Object.values(stats).reduce((sum, stat) => sum + stat.correct, 0);
  const totalAccuracy = totalAttempts === 0 ? null : Math.round((totalCorrect / totalAttempts) * 100);
  const weakCards = [...visibleCards]
    .map((card) => ({ card, stat: getStat(stats, card.id) }))
    .filter(({ stat }) => stat.wrong > 0)
    .sort((a, b) => b.stat.wrong - a.stat.wrong)
    .slice(0, 5);

  const clearTimer = () => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const nextRound = (nextStats = stats, nextMode = mode, nextDomain = domain, nextRepairQueue = repairQueue) => {
    clearTimer();
    const built = buildRound(nextMode, nextDomain, nextStats, nextRepairQueue);
    setRound(built.round);
    setRepairQueue(built.repairQueue);
    setSelected(null);
    setLastCorrect(null);
  };

  const nextRecallGroup = (nextStats = stats, nextDomain = domain, nextRepairQueue = recallRepairQueue) => {
    clearTimer();
    const groups = getVisibleGroups(nextDomain);
    const nextGroup = pickWeightedGroup(groups, nextStats, nextRepairQueue);
    const consumedQueue = nextRepairQueue.filter((groupId, index) => groupId !== nextGroup.id || index !== nextRepairQueue.indexOf(nextGroup.id));

    setRecallGroup(nextGroup);
    setRecallRepairQueue(consumedQueue);
    setRecallInput("");
    setRecallResult(null);
  };

  const answer = (option: string) => {
    if (selected !== null) return;

    const isCorrect = option === round.answer;
    const stat = getStat(stats, round.card.id);
    const nextStats = {
      ...stats,
      [round.card.id]: {
        attempts: stat.attempts + 1,
        correct: stat.correct + (isCorrect ? 1 : 0),
        wrong: stat.wrong + (isCorrect ? 0 : 1),
        streak: isCorrect ? Math.max(0, stat.streak) + 1 : Math.min(0, stat.streak) - 1,
      },
    };

    setStats(nextStats);
    saveStats(nextStats);
    setSelected(option);
    setLastCorrect(isCorrect);
    const nextRepairQueue = isCorrect ? repairQueue : [round.card.id, round.card.id, ...repairQueue].slice(0, 8);
    setRepairQueue(nextRepairQueue);

    timerRef.current = window.setTimeout(() => nextRound(nextStats, mode, domain, nextRepairQueue), isCorrect ? AUTO_NEXT_CORRECT_MS : AUTO_NEXT_WRONG_MS);
  };

  const changeMode = (nextMode: TaskOneMode) => {
    setMode(nextMode);
    if (nextMode === "recall") {
      nextRecallGroup(stats, domain);
    } else {
      nextRound(stats, nextMode, domain);
    }
  };

  const changeDomain = (nextDomain: "all" | TaskOneDomain) => {
    setDomain(nextDomain);
    if (mode === "recall") {
      nextRecallGroup(stats, nextDomain, recallRepairQueue);
    } else {
      nextRound(stats, mode, nextDomain);
    }
  };

  const submitRecall = () => {
    if (recallResult !== null) return;
    const result = checkRecallAnswer(recallInput, recallGroup);
    const stat = getStat(stats, `group:${recallGroup.id}`);
    const nextStats = {
      ...stats,
      [`group:${recallGroup.id}`]: {
        attempts: stat.attempts + 1,
        correct: stat.correct + (result.isPerfect ? 1 : 0),
        wrong: stat.wrong + (result.isPerfect ? 0 : 1),
        streak: result.isPerfect ? Math.max(0, stat.streak) + 1 : Math.min(0, stat.streak) - 1,
      },
    };
    const nextRepairQueue = result.isPerfect ? recallRepairQueue : [recallGroup.id, recallGroup.id, ...recallRepairQueue].slice(0, 8);

    setStats(nextStats);
    saveStats(nextStats);
    setRecallResult(result);
    setRecallRepairQueue(nextRepairQueue);
  };

  const reset = () => {
    const confirmed = window.confirm("Сбросить прогресс по заданию 1?");
    if (!confirmed) return;
    setStats({});
    saveStats({});
    setRepairQueue([]);
    setRecallRepairQueue([]);
    nextRound({}, mode, domain, []);
    nextRecallGroup({}, domain, []);
  };

  useEffect(() => clearTimer, []);

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-4 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Задание 1</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-stone-950 sm:text-2xl">Игра на разряды и связки</h1>
            <span className="rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-700">{visibleCards.length} карточек</span>
          </div>
        </div>

        <div className="space-y-4 px-3 py-4 sm:px-6 sm:py-6">
          <div className="grid grid-cols-4 gap-2">
            {modes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => changeMode(item.id)}
                className={[
                  "h-11 rounded-md border px-2 text-sm font-semibold transition",
                  mode === item.id ? "border-teal-600 bg-teal-50 text-teal-950" : "border-stone-200 bg-white text-stone-700",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {domains.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => changeDomain(item.id)}
                className={[
                  "h-10 shrink-0 rounded-md border px-3 text-sm font-semibold transition",
                  domain === item.id ? "border-stone-950 bg-stone-950 text-white" : "border-stone-200 bg-white text-stone-700",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
          </div>

          {mode === "recall" ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-teal-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-teal-900">
                    {taskOneDomains[recallGroup.domain]}
                  </span>
                  <span className="rounded-md bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-700">активное вспоминание</span>
                </div>
                <p className="mt-7 text-sm font-medium text-stone-500">Назови все слова из разряда</p>
                <div className="mt-2 text-center text-3xl font-semibold text-stone-950 sm:text-5xl">{recallGroup.title}</div>
                <p className="mx-auto mt-5 max-w-xl text-center text-sm text-stone-600">{recallGroup.rule}</p>
              </div>

              <textarea
                value={recallInput}
                onChange={(event) => setRecallInput(event.target.value)}
                disabled={recallResult !== null}
                placeholder="Пиши через запятую: я, ты, он..."
                className="min-h-32 w-full resize-y rounded-lg border border-stone-200 bg-white px-4 py-3 text-base text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100 disabled:bg-stone-50"
              />

              {recallResult ? (
                <div className={["rounded-lg border p-4", recallResult.isPerfect ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"].join(" ")}>
                  <div className="flex items-center gap-2 font-semibold">
                    {recallResult.isPerfect ? <Check className="h-5 w-5 text-emerald-700" /> : <X className="h-5 w-5 text-rose-700" />}
                    <span>{recallResult.isPerfect ? "Полный список" : `Вспомнил ${recallResult.score}%`}</span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <ResultList title="Вспомнил" items={recallResult.found} tone="good" />
                    <ResultList title="Забыл" items={recallResult.missing} tone="bad" />
                  </div>
                  <p className="mt-3 text-sm text-stone-700">Правильный формат: {recallGroup.items.join(", ")}</p>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={submitRecall}
                  disabled={recallInput.trim().length === 0 || recallResult !== null}
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-md bg-stone-950 px-4 text-sm font-semibold text-white disabled:bg-stone-300"
                >
                  Проверить
                </button>
                <button
                  type="button"
                  onClick={() => nextRecallGroup()}
                  disabled={recallResult === null}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 disabled:text-stone-300"
                >
                  Следующий разряд
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-teal-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-teal-900">
                    {taskOneDomains[round.card.domain]}
                  </span>
                  <span className="rounded-md bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-700">
                    {round.mode === "classify" ? "узнай разряд" : "найди пример"}
                  </span>
                </div>

                {round.mode === "classify" ? (
                  <>
                    <p className="mt-7 text-sm font-medium text-stone-500">К какому разряду относится?</p>
                    <div className="mt-2 text-center text-4xl font-semibold text-stone-950 sm:text-5xl">{round.card.item}</div>
                  </>
                ) : (
                  <>
                    <p className="mt-7 text-sm font-medium text-stone-500">Выбери пример для разряда</p>
                    <div className="mt-2 text-center text-2xl font-semibold text-stone-950 sm:text-4xl">{round.card.groupTitle}</div>
                  </>
                )}

                <p className="mx-auto mt-5 max-w-xl text-center text-sm text-stone-600">{round.card.rule}</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {round.options.map((option) => {
                  const isSelected = selected === option;
                  const isAnswer = selected !== null && option === round.answer;
                  const isWrong = isSelected && !isAnswer;

                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={selected !== null}
                      onClick={() => answer(option)}
                      className={[
                        "min-h-14 rounded-md border px-4 py-3 text-left text-base font-semibold transition active:scale-[0.99]",
                        selected === null ? "border-stone-200 bg-white text-stone-900 hover:border-teal-400" : "border-stone-200 bg-white text-stone-500",
                        isAnswer ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "",
                        isWrong ? "border-rose-500 bg-rose-50 text-rose-900" : "",
                      ].join(" ")}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              <div className="flex min-h-14 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {lastCorrect === null ? (
                  <p className="text-sm text-stone-600">Сначала вспомни ответ сам, потом выбирай вариант.</p>
                ) : (
                  <div className={["rounded-md px-3 py-2 text-sm", lastCorrect ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"].join(" ")}>
                    <div className="flex items-center gap-2 font-semibold">
                      {lastCorrect ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      {lastCorrect ? "Верно" : `Нужно: ${round.answer}`}
                    </div>
                    <p className="mt-1">
                      Проговори: «{round.card.item}» — {round.card.groupTitle.toLocaleLowerCase("ru-RU")}. {round.card.rule}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => nextRound()}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-stone-950 px-4 text-sm font-semibold text-white disabled:bg-stone-300"
                  disabled={selected === null}
                >
                  Сразу дальше
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <aside className="space-y-3">
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
            <Brain className="h-4 w-4 text-teal-700" />
            Прогресс
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatTile label="Ответы" value={totalAttempts} />
            <StatTile label="Точность" value={totalAccuracy === null ? "—" : `${totalAccuracy}%`} />
            <StatTile label="Серия" value={currentStat.streak} />
          </div>
          <button
            type="button"
            onClick={reset}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-stone-200 text-sm font-semibold text-stone-700"
          >
            <RotateCcw className="h-4 w-4" />
            Сбросить задание 1
          </button>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
            <Sparkles className="h-4 w-4 text-amber-600" />
            Быстрое запоминание
          </h2>
          <div className="mt-4 space-y-2 text-sm text-stone-600">
            <p>Активное вспоминание: сначала назови ответ в голове, потом жми.</p>
            <p>Чередование: «Блиц» мешает типы вопросов, чтобы знание не было привязано к шаблону.</p>
            <p>Исправление ошибок: промах возвращается в ближайшие вопросы.</p>
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
            <Repeat2 className="h-4 w-4 text-teal-700" />
            Возврат ошибок
          </h2>
          <div className="mt-4 rounded-md bg-teal-50 px-3 py-3 text-sm text-teal-900">
            В очереди повторения: <span className="font-semibold">{mode === "recall" ? recallRepairQueue.length : repairQueue.length}</span>
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
            <Layers3 className="h-4 w-4 text-rose-600" />
            Слабые карточки
          </h2>
          {weakCards.length === 0 ? (
            <p className="mt-4 text-sm text-stone-600">Ошибок пока нет.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {weakCards.map(({ card, stat }) => (
                <div key={card.id} className="rounded-md bg-stone-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-semibold text-stone-950">{card.item}</p>
                    <span className="rounded-md bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">{stat.wrong}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-stone-500">{card.groupTitle}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-stone-100 px-2 py-3 text-center text-stone-900">
      <div className="text-lg font-semibold">{value}</div>
      <div className="mt-1 text-xs">{label}</div>
    </div>
  );
}

function ResultList({ title, items, tone }: { title: string; items: string[]; tone: "good" | "bad" }) {
  const toneClass = tone === "good" ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900";

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.length === 0 ? (
          <span className="text-sm text-stone-500">пусто</span>
        ) : (
          items.map((item) => (
            <span key={item} className={`rounded-md px-2 py-1 text-sm font-medium ${toneClass}`}>
              {item}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
