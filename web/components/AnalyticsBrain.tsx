"use client";

import { FormEvent, useState } from "react";
import { BarChart3, Bot, Loader2, Search } from "lucide-react";
import { Card, CardHeader } from "@/components/Card";

type ChatState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; answer: string; results: any[] }
  | { status: "error"; message: string };

type QueryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; sql: string; rows: any[]; note?: string }
  | { status: "error"; message: string; sql?: string };

export function AnalyticsBrain() {
  const [chatQuestion, setChatQuestion] = useState(
    "What historical theft patterns should I know about?",
  );
  const [queryQuestion, setQueryQuestion] = useState(
    "Give me theft frequency per aisle",
  );
  const [chatState, setChatState] = useState<ChatState>({ status: "idle" });
  const [queryState, setQueryState] = useState<QueryState>({ status: "idle" });

  async function askChat(event: FormEvent) {
    event.preventDefault();
    setChatState({ status: "loading" });

    const response = await fetch("/api/analytics/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: chatQuestion }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setChatState({
        status: "error",
        message: payload?.answer || payload?.error || "Snowflake chat failed.",
      });
      return;
    }

    setChatState({
      status: "success",
      answer: payload.answer,
      results: payload.results || [],
    });
  }

  async function askQuery(event: FormEvent) {
    event.preventDefault();
    setQueryState({ status: "loading" });

    const response = await fetch("/api/analytics/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: queryQuestion }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setQueryState({
        status: "error",
        message: payload?.note || payload?.error || "Snowflake query failed.",
        sql: payload?.sql,
      });
      return;
    }

    setQueryState({
      status: "success",
      sql: payload.sql,
      rows: payload.rows || [],
      note: payload.note,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[34px] font-semibold tracking-tight text-ink-900">
            Analytics
          </h1>
          <p className="text-[15px] text-ink-500 mt-1">
            Snowflake historical brain for long-term detection search and analysis
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Bot className="h-5 w-5 text-rust-500" />
                Cortex Search Chat
              </span>
            }
          />
          <form onSubmit={askChat} className="px-6 py-5 space-y-4">
            <textarea
              value={chatQuestion}
              onChange={(event) => setChatQuestion(event.target.value)}
              className="min-h-[108px] w-full resize-y rounded-lg border border-ink-900/10 bg-paper-100 px-3 py-2.5 text-[15px] text-ink-900 outline-none transition focus:border-rust-500/60 focus:ring-2 focus:ring-rust-500/15"
            />
            <button
              type="submit"
              disabled={chatState.status === "loading"}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rust-500 px-4 text-[15px] font-medium text-paper-50 transition hover:bg-rust-500/90 disabled:opacity-65"
            >
              {chatState.status === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Ask historical brain
            </button>
            {chatState.status === "success" && (
              <div className="rounded-lg bg-paper-100 border border-ink-900/5 px-4 py-3 text-[14px] leading-6 text-ink-800">
                {chatState.answer}
              </div>
            )}
            {chatState.status === "error" && (
              <div className="rounded-lg bg-red-50 border border-red-900/10 px-4 py-3 text-[14px] text-red-900">
                {chatState.message}
              </div>
            )}
          </form>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-rust-500" />
                NL-to-SQL
              </span>
            }
          />
          <form onSubmit={askQuery} className="px-6 py-5 space-y-4">
            <textarea
              value={queryQuestion}
              onChange={(event) => setQueryQuestion(event.target.value)}
              className="min-h-[108px] w-full resize-y rounded-lg border border-ink-900/10 bg-paper-100 px-3 py-2.5 text-[15px] text-ink-900 outline-none transition focus:border-rust-500/60 focus:ring-2 focus:ring-rust-500/15"
            />
            <button
              type="submit"
              disabled={queryState.status === "loading"}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 text-[15px] font-medium text-paper-50 transition hover:bg-ink-700 disabled:opacity-65"
            >
              {queryState.status === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BarChart3 className="h-4 w-4" />
              )}
              Generate query
            </button>
            {(queryState.status === "success" || queryState.status === "error") && (
              <pre className="max-h-[220px] overflow-auto rounded-lg bg-ink-900 px-4 py-3 text-[12px] leading-5 text-paper-100">
                {queryState.status === "success"
                  ? queryState.sql
                  : queryState.sql || queryState.message}
              </pre>
            )}
            {queryState.status === "success" && (
              <div className="max-h-[260px] overflow-auto rounded-lg border border-ink-900/5 bg-paper-100">
                <pre className="p-4 text-[12px] leading-5 text-ink-800">
                  {JSON.stringify(queryState.rows.slice(0, 20), null, 2)}
                </pre>
              </div>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}
