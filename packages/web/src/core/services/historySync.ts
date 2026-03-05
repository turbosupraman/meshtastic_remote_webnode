import type { Message } from "@core/stores/messageStore/types.ts";

const rawBaseUrl = (import.meta.env.VITE_HISTORY_SYNC_URL ?? "").trim();

const normalizeBaseUrl = (value: string): string => value.replace(/\/$/, "");

const inferBaseUrl = (): string | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  const proto = window.location.protocol === "https:" ? "https:" : "http:";
  const host = window.location.hostname;
  if (!host) {
    return undefined;
  }
  return `${proto}//${host}:4410/api/history`;
};

const baseUrl = normalizeBaseUrl(rawBaseUrl || inferBaseUrl() || "");

const headers = { "Content-Type": "application/json" };

export type HistorySyncMessage = Message;

type HistoryScope = {
  scope: string;
  myNodeNum: number;
};

type HistorySyncPayload = HistoryScope & {
  message: HistorySyncMessage;
};

export const historySync = {
  isEnabled(): boolean {
    return baseUrl.length > 0;
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

    try {
      const response = await fetch(`${baseUrl}/messages?${query.toString()}`, {
        method: "GET",
      });
      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as { messages?: HistorySyncMessage[] };
      return Array.isArray(data.messages) ? data.messages : [];
    } catch {
      return [];
    }
  },

  async pushMessage({ scope, myNodeNum, message }: HistorySyncPayload) {
    if (!this.isEnabled()) {
      return;
    }

    try {
      await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          scope,
          myNodeNum,
          message,
        }),
      });
    } catch {
      // ignore sync failures and keep mesh UX unaffected
    }
  },
};
