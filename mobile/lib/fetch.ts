export type FetchJsonOptions = Omit<RequestInit, 'body'> & {
  timeoutMs?: number;
  body?: unknown;
};

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? 20_000;

  // RN doesn't reliably support AbortSignal.timeout.
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: FetchJsonOptions = {}
): Promise<{ ok: boolean; status: number; data: T | null; errorText: string }> {
  const { timeoutMs, body, headers, ...rest } = init;

  const response = await fetchWithTimeout(input, {
    ...rest,
    timeoutMs,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : null),
      ...(headers ?? null),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text().catch(() => '');
  const maybeJson = text ? (safeJsonParse(text) as T | null) : null;

  return {
    ok: response.ok,
    status: response.status,
    data: maybeJson,
    errorText: text,
  };
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

