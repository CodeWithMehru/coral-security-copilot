"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Terminal, Database, Copy, Check } from "lucide-react";
import type { ChatMessage, ChatGenerateResponse, CoralSqlResponse } from "@/lib/types";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { InfoBanner } from "@/components/ui/InfoBanner";
import {
  CHAT_QUERY_FAILED_MESSAGE,
  isRateLimitMessage,
  RATE_LIMIT_USER_MESSAGE,
} from "@/lib/errors";
import { SqlResultTable } from "@/components/ui/SqlResultTable";
import { SUGGESTED_PROMPTS } from "@/lib/suggested-prompts";
import { cn } from "@/lib/utils";

type ChatPhase = "idle" | "generating" | "executing";

function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
          <Terminal className="h-3 w-3" />
          Generated Coral SQL
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="mt-1 max-h-64 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-emerald-400/90">
        {sql}
      </pre>
    </div>
  );
}

const LIVE_SYSTEM =
  "Live mode: questions are translated into read-only Coral SQL (GitHub, Notion, Slack) and executed via the Coral CLI. Results are real API data — empty results mean no matching records, not sample data.";

const DEMO_SYSTEM =
  "Demonstration data is disabled in the UI. Set CORALSEC_USE_DEMO=false for live Coral SQL.";

export function ChatInterface() {
  const [systemText, setSystemText] = useState(LIVE_SYSTEM);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loading = phase !== "idle";

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => {
        setSystemText(c.isDemo ? DEMO_SYSTEM : LIVE_SYSTEM);
        setMessages([
          {
            id: "sys-1",
            role: "system",
            content: c.isDemo ? DEMO_SYSTEM : LIVE_SYSTEM,
            timestamp: new Date().toISOString(),
          },
        ]);
      })
      .catch(() => {
        setMessages([
          {
            id: "sys-1",
            role: "system",
            content: LIVE_SYSTEM,
            timestamp: new Date().toISOString(),
          },
        ]);
      });
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setPhase("generating");

    const assistantId = `a-${Date.now()}`;

    try {
      const genRes = await fetch("/api/coral/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const genData = (await genRes.json()) as ChatGenerateResponse & {
        error?: string;
      };
      if (!genRes.ok) {
        throw new Error(genData.error ?? "Failed to generate SQL");
      }

      setMessages((m) => [
        ...m,
        {
          id: assistantId,
          role: "assistant",
          content: genData.explanation,
          sql: genData.sql,
          timestamp: new Date().toISOString(),
        },
      ]);
      setPhase("executing");
      setTimeout(scrollToBottom, 50);

      const sqlRes = await fetch("/api/coral/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: genData.sql,
          queryKind: genData.queryKind,
        }),
      });
      const sqlData = (await sqlRes.json()) as CoralSqlResponse & {
        error?: string;
        errorKind?: string;
        dataSource?: "coral" | "demo";
        notice?: string;
      };

      const isLiveCoral = sqlData.dataSource === "coral";
      const hasRows = (sqlData.rows?.length ?? 0) > 0;
      const execError = sqlData.error ?? (!sqlRes.ok ? sqlData.notice : undefined);
      const isRateLimited =
        sqlData.errorKind === "rate_limit" ||
        (!!execError && isRateLimitMessage(execError));

      let notice = sqlData.notice;
      if (execError && !hasRows) {
        notice = execError;
        if (isRateLimited || sqlData.errorKind === "auth") {
          setError(null);
        } else {
          setError(execError);
        }
      } else if (isLiveCoral && !hasRows && !execError) {
        notice =
          "No rows matched this query. For secrets, push a test credential to the repo or check that secret scanning is enabled.";
        setError(null);
      } else {
        setError(null);
      }

      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                result: {
                  sql: sqlData.sql ?? genData.sql,
                  raw: sqlData.raw ?? "",
                  columns: sqlData.columns ?? [],
                  rows: sqlData.rows ?? [],
                  rowCount: sqlData.rowCount ?? 0,
                  durationMs: sqlData.durationMs ?? 0,
                  error: hasRows ? undefined : execError,
                },
                dataSource: sqlData.dataSource ?? "coral",
                notice,
              }
            : msg
        )
      );
      setTimeout(scrollToBottom, 100);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Request failed";
      const rateLimited = isRateLimitMessage(raw);
      const msg = rateLimited ? RATE_LIMIT_USER_MESSAGE : raw || CHAT_QUERY_FAILED_MESSAGE;
      if (!rateLimited) setError(msg);
      setMessages((m) => {
        const hasAssistant = m.some((x) => x.id === assistantId);
        if (hasAssistant) {
          return m.map((x) =>
            x.id === assistantId
              ? {
                  ...x,
                  notice: msg,
                  content: rateLimited
                    ? `${x.content}\n\nGitHub rate limit reached. Please wait 30 minutes, then retry.`
                    : `${x.content}\n\nExecution could not complete.`,
                }
              : x
          );
        }
        return m;
      });
    } finally {
      setPhase("idle");
    }
  };

  const loadingLabel =
    phase === "generating"
      ? "Generating Coral SQL…"
      : "Executing live Coral SQL…";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {messages.map((msg) => {
            if (msg.role === "system") {
              return (
                <div
                  key={msg.id}
                  className="rounded-lg border border-coral-border bg-slate-900/40 px-4 py-3 text-sm text-slate-400"
                >
                  {msg.content || systemText}
                </div>
              );
            }

            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={cn("flex", isUser ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[95%] rounded-lg px-4 py-3 text-sm",
                    isUser
                      ? "bg-slate-800 text-slate-100"
                      : "border border-coral-border bg-coral-panel text-slate-300"
                  )}
                >
                  {!isUser ? (
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      CoralSec Agent
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  {msg.sql ? <SqlBlock sql={msg.sql} /> : null}
                  {msg.result ? (
                    <SqlResultTable
                      result={msg.result}
                      dataSource={msg.dataSource}
                      notice={msg.notice}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
          {loading ? <LoadingState label={loadingLabel} /> : null}
          {error ? (
            <ErrorBanner message={error} onRetry={() => setError(null)} />
          ) : null}
          {messages.some((m) => m.notice && isRateLimitMessage(m.notice)) && !error ? (
            <InfoBanner message="GitHub rate limit reached. Please wait 30 minutes." />
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-coral-border bg-coral-elevated px-4 py-3 lg:px-6">
        <div className="mx-auto max-w-4xl">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            Suggested queries (Coral SQL)
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map(({ label, message }) => (
              <button
                key={label}
                type="button"
                onClick={() => sendMessage(message)}
                disabled={loading}
                className="rounded-md border border-coral-border bg-coral-panel px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Database className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about secrets, CVEs, access, compliance, or Slack…"
                className="w-full rounded-lg border border-coral-border bg-coral-panel py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30 disabled:opacity-60"
                disabled={loading}
                aria-busy={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex min-w-[88px] items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {loading ? "…" : "Run"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
