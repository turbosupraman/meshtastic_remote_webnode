import type { Message } from "@core/stores/messageStore/types.ts";

const rawBaseUrl = (import.meta.env.VITE_HISTORY_SYNC_URL ?? "").trim();

const normalizeBaseUrl = (value: string): string =>
  value.replace(/\/$/, "").trim();

const unique = (values: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
};

const inferBaseUrls = (): string[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const proto = window.location.protocol === "https:" ? "https:" : "http:";
  const host = window.location.hostname;
  const origin = window.location.origin;

  const candidates = [
    `${origin}/api/history`,
    host ? `${proto}//${host}:4410/api/history` : "",
  ];

  return unique(candidates.map(normalizeBaseUrl));
};

const candidateBaseUrls = rawBaseUrl
  ? [normalizeBaseUrl(rawBaseUrl)]
  : inferBaseUrls();

const headers = { "Content-Type": "application/json" };

export type HistorySyncMessage = Message;

type HistoryScope = {
  scope: string;
  myNodeNum: number;
};

type HistorySyncPayload = HistoryScope & {
  message: HistorySyncMessage;
};

let activeBaseUrl: string | undefined;

const withFallback = async <T>(
  request: (baseUrl: string) => Promise<T | undefined>,
): Promise<T | undefined> => {
  if (activeBaseUrl) {
    const activeResult = await request(activeBaseUrl);
    if (activeResult !== undefined) {
      return activeResult;
    }
  }

  for (const baseUrl of candidateBaseUrls) {
    if (baseUrl === activeBaseUrl) {
      continue;
    }

    const result = await request(baseUrl);
    if (result !== undefined) {
      activeBaseUrl = baseUrl;
      return result;
    }
  }

  return undefined;
};

export const historySync = {
  isEnabled(): boolean {
    return candidateBaseUrls.length > 0;
  },

  async pullMessages({
    scope,
    myNodeNum,
  }: HistoryScope): Promise<HistorySyncMessage[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const query = new URLSearchParams({
      scope,
      myNodeNum: String(myNodeNum),
    });

    const response = await withFallback(async (baseUrl) => {
      try {
        const result = await fetch(`${baseUrl}/messages?${query.toString()}`, {
          method: "GET",
        });
        if (!result.ok) {
          return undefined;
        }

        const data = (await result.json()) as {
          messages?: HistorySyncMessage[];
        };
        return Array.isArray(data.messages) ? data.messages : [];
      } catch {
        return undefined;
      }
    });

    return response ?? [];
  },

  async pushMessage({ scope, myNodeNum, message }: HistorySyncPayload) {
    if (!this.isEnabled()) {
      return;
    }

    await withFallback(async (baseUrl) => {
      try {
        const response = await fetch(`${baseUrl}/messages`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            scope,
            myNodeNum,
            message,
          }),
        });

        if (!response.ok) {
          return undefined;
        }

        return true;
      } catch {
        return undefined;
      }
    });
  },
};
