import type { Env } from "./types";
import { fetchWithRetry } from "./http";

const REST_COUNTRIES_SEARCH = "https://api.restcountries.com/countries/v5";

export async function validateCountryWithRestCountries(
  countryRaw: string,
  env: Env
): Promise<boolean> {
  const url = `${REST_COUNTRIES_SEARCH}?q=${encodeURIComponent(countryRaw)}`;
  const headers: HeadersInit = {};
  if (env.RESTCOUNTRIES_API_KEY) {
    headers.Authorization = `Bearer ${env.RESTCOUNTRIES_API_KEY}`;
  }

  try {
    const response = await fetchWithRetry(
      url,
      { method: "GET", headers },
      { timeoutMs: 4000, retries: 1 }
    );
    if (!response.ok) return false;
    const data = (await response.json()) as {
      data?: { objects?: unknown[] };
      objects?: unknown[];
    };
    const objects = data.data?.objects ?? data.objects;
    return Array.isArray(objects) && objects.length > 0;
  } catch {
    return false;
  }
}

interface JinaEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
  results?: Array<{ embedding?: number[]; score?: number; similarity?: number }>;
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

async function fetchEmbeddings(texts: string[], env: Env): Promise<number[][] | null> {
  if (!env.JINA_API_KEY) return null;

  const response = await fetchWithRetry(
    "https://api.jina.ai/v1/embeddings",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.JINA_API_KEY}`,
      },
      body: JSON.stringify({
        model: "jina-embeddings-v5-text-small",
        task: "text-matching",
        normalized: true,
        input: texts,
      }),
    },
    { timeoutMs: 8000, retries: 1 }
  );

  if (!response.ok) return null;
  const json = (await response.json()) as JinaEmbeddingResponse;
  const vectors = json.data?.map((item) => item.embedding).filter((embedding): embedding is number[] => Array.isArray(embedding));
  if (vectors && vectors.length === texts.length) return vectors;
  return null;
}

export async function isDuplicateByAi(
  previousBody: string,
  nextBody: string,
  env: Env
): Promise<{ duplicate: boolean; score: number | null }> {
  const embeddings = await fetchEmbeddings([previousBody, nextBody], env);
  if (!embeddings || embeddings.length !== 2) {
    return { duplicate: false, score: null };
  }

  const score = cosineSimilarity(embeddings[0], embeddings[1]);
  return { duplicate: score >= 0.92, score };
}