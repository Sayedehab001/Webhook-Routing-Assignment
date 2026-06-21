export interface RetryOptions {
  timeoutMs: number;
  retries: number;
  retryOn5xx?: boolean;
}

function backoffMs(attempt: number): number {
  return 300 * Math.pow(2, attempt); // 300ms, 600ms, 1200ms, ...
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOptions
): Promise<Response> {
  const { timeoutMs, retries, retryOn5xx = true } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (retryOn5xx && res.status >= 500 && attempt < retries) {
        lastError = new Error(`Upstream returned ${res.status}`);
        await sleep(backoffMs(attempt));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) {
        await sleep(backoffMs(attempt));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
