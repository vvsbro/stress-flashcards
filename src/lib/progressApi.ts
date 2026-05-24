import type { StatsByWord } from "./stress";

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
};

export const fetchStatsFromDb = () => requestJson<StatsByWord>("/api/stats");

export const recordAnswerInDb = (wordId: string, isCorrect: boolean) => {
  return requestJson<StatsByWord>("/api/answer", {
    method: "POST",
    body: JSON.stringify({ wordId, isCorrect }),
  });
};

export const resetDbStats = () => {
  return requestJson<StatsByWord>("/api/reset", {
    method: "POST",
    body: "{}",
  });
};
