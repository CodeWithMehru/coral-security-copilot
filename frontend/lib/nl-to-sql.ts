import type { QueryKind } from "./query-kinds";
import { buildQueryForKind } from "./coral-queries";
import { isDemoMode } from "./env";
import { AGENT_SYSTEM_PROMPT, getIntentGuideline } from "./agent-system-prompt";
import {
  buildSqlForRoutedPlan,
  classifyUserIntent,
  explanationForRoutedPlan,
} from "./intent-router";

export interface GeneratedQuery {
  sql: string;
  explanation: string;
  queryKind: QueryKind;
  fromTemplate: boolean;
  systemPrompt: string;
  routedIntent?: string;
}

export function naturalLanguageToSql(input: string): GeneratedQuery {
  const trimmed = input.trim();

  if (/^\s*SELECT\b/i.test(trimmed)) {
    return {
      sql: trimmed,
      explanation: "Executing provided read-only SQL against Coral sources.",
      queryKind: "unified_events",
      fromTemplate: false,
      systemPrompt: AGENT_SYSTEM_PROMPT,
    };
  }

  const plan = classifyUserIntent(trimmed);
  const sql = isDemoMode()
    ? buildQueryForKind(plan.queryKind)
    : buildSqlForRoutedPlan(plan, trimmed);

  const explanation = `${explanationForRoutedPlan(plan)} (${getIntentGuideline(plan.agentIntent)})`;

  return {
    sql,
    explanation,
    queryKind: plan.queryKind,
    fromTemplate: true,
    systemPrompt: AGENT_SYSTEM_PROMPT,
    routedIntent: plan.routedIntent,
  };
}
