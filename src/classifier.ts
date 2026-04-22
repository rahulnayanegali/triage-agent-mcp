export type Severity = "P0" | "P1" | "P2" | "P3";

export interface IssueData {
  id: string;
  title: string;
  culprit: string;
  eventCount: number;
  userCount: number;
  environment?: string;
  url?: string;
}

export interface Route {
  name: string;
  description: string;
  severity: Severity;
  team: string;
  assignee: string;
}

export interface EscalationRule {
  name: string;
  trigger: {
    field: "url" | "event_count" | "environment";
    operator: "contains" | "gt" | "eq";
    value: string | number;
  };
  action: "force_p0" | "bump" | "floor_p1";
}

export interface TriageConfig {
  routes: Route[];
  escalationRules: EscalationRule[];
}

export interface TriageResult {
  issueId: string;
  severity: Severity;
  team: string;
  assignee: string;
  reason: string[];
  ticketTitle: string;
  confidence: "high" | "low";
}

// --- private helpers ---

const SEVERITY_ORDER: Severity[] = ["P0", "P1", "P2", "P3"];

function bumpSeverity(s: Severity): Severity {
  const idx = SEVERITY_ORDER.indexOf(s);
  return idx > 0 ? SEVERITY_ORDER[idx - 1] : "P0";
}

function extractKeyValue(line: string): [string, string] | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return null;
  const key = line.slice(0, colonIdx).trim();
  let value = line.slice(colonIdx + 1).trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  return [key, value];
}

function parseBlocksAfterHeading(
  raw: string,
  headingPattern: RegExp
): Array<Record<string, string> & { _name: string }> {
  const headingMatch = raw.match(headingPattern);
  if (!headingMatch || headingMatch.index === undefined) return [];

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const nextSection = raw.slice(sectionStart).match(/^##\s+/m);
  const sectionEnd = nextSection?.index !== undefined
    ? sectionStart + nextSection.index
    : raw.length;

  const section = raw.slice(sectionStart, sectionEnd);
  const lines = section.split("\n");
  const blocks: Array<Record<string, string> & { _name: string }> = [];

  let i = 0;
  while (i < lines.length) {
    const headerMatch = lines[i].match(/^###\s+(.+)/);
    if (!headerMatch) { i++; continue; }

    const block: Record<string, string> & { _name: string } = { _name: headerMatch[1].trim() };
    i++;
    while (i < lines.length && !lines[i].trimStart().startsWith("###")) {
      const kv = extractKeyValue(lines[i].trim());
      if (kv) block[kv[0]] = kv[1];
      i++;
    }
    blocks.push(block);
  }

  return blocks;
}

function parseRoutesFromContext(raw: string): Route[] {
  // Routes live at the top level — scan the whole file for ### blocks
  // (outside any specific section), using a virtual heading at position 0.
  const lines = raw.split("\n");
  const routes: Route[] = [];

  let i = 0;
  while (i < lines.length) {
    const headerMatch = lines[i].match(/^###\s+(.+)/);
    if (!headerMatch) { i++; continue; }

    const name = headerMatch[1].trim();
    const block: Record<string, string> = {};
    i++;
    while (i < lines.length && !lines[i].trimStart().startsWith("###")) {
      const kv = extractKeyValue(lines[i].trim());
      if (kv) block[kv[0]] = kv[1];
      i++;
    }

    if (!block["description"] || !block["severity"] || !block["team"] || !block["assignee"]) continue;
    if (block["team"] === "Ignore") continue;

    routes.push({
      name,
      description: block["description"],
      severity: block["severity"] as Severity,
      team: block["team"],
      assignee: block["assignee"],
    });
  }

  return routes;
}

function parseTrigger(raw: string): EscalationRule["trigger"] | null {
  const containsMatch = raw.match(/^(url)\s+contains\s+(.+)$/i);
  if (containsMatch) return { field: "url", operator: "contains", value: containsMatch[2].trim() };

  const gtMatch = raw.match(/^(event_count)\s+>\s+(\d+)$/i);
  if (gtMatch) return { field: "event_count", operator: "gt", value: parseInt(gtMatch[2], 10) };

  const eqMatch = raw.match(/^(environment)\s+=\s+(.+)$/i);
  if (eqMatch) return { field: "environment", operator: "eq", value: eqMatch[2].trim() };

  return null;
}

function parseAction(raw: string): EscalationRule["action"] | null {
  const lower = raw.toLowerCase().trim();
  if (lower === "force p0") return "force_p0";
  if (lower === "bump") return "bump";
  if (lower === "floor p1") return "floor_p1";
  return null;
}

function parseEscalationRules(raw: string): EscalationRule[] {
  const blocks = parseBlocksAfterHeading(raw, /^##\s+escalation\s+rules?\s*$/im);
  const rules: EscalationRule[] = [];

  for (const block of blocks) {
    if (!block["trigger"] || !block["action"]) continue;
    const trigger = parseTrigger(block["trigger"]);
    const action = parseAction(block["action"]);
    if (!trigger || !action) continue;
    rules.push({ name: block._name, trigger, action });
  }

  return rules;
}

// --- exports ---

export function parseTriageConfig(raw: string): TriageConfig {
  return {
    routes: parseRoutesFromContext(raw),
    escalationRules: parseEscalationRules(raw),
  };
}

export function classifyIssue(issue: IssueData, config: TriageConfig): TriageResult {
  const haystack = new Set(
    (issue.title + " " + issue.culprit).toLowerCase().split(/[\W_]+/).filter(Boolean)
  );

  let bestRoute: Route | null = null;
  let bestCount = 0;
  let bestMatchedWords: string[] = [];

  for (const route of config.routes) {
    const words = route.description.toLowerCase().split(/\W+/).filter(Boolean);
    const matched = words.filter((w) => haystack.has(w));
    if (matched.length > bestCount) {
      bestCount = matched.length;
      bestRoute = route;
      bestMatchedWords = matched;
    }
  }

  const reason: string[] = [];
  let severity: Severity;
  let team: string;
  let assignee: string;
  let confidence: "high" | "low";

  if (bestCount === 0 || !bestRoute) {
    severity = "P2";
    team = "Backend";
    assignee = "unknown";
    confidence = "low";
    reason.push("No route matched. Defaulted to P2 Backend.");
  } else {
    severity = bestRoute.severity;
    team = bestRoute.team;
    assignee = bestRoute.assignee;
    confidence = bestCount >= 2 ? "high" : "low";
    reason.push(`Matched route '${bestRoute.name}' with ${bestCount} word(s): ${bestMatchedWords.join(", ")}`);
  }

  for (const rule of config.escalationRules) {
    const { field, operator, value } = rule.trigger;
    let fired = false;

    if (field === "url" && operator === "contains") {
      fired = issue.url?.includes(value as string) ?? false;
    } else if (field === "event_count" && operator === "gt") {
      fired = issue.eventCount > (value as number);
    } else if (field === "environment" && operator === "eq") {
      fired = issue.environment === value;
    }

    if (!fired) continue;

    const before = severity;
    if (rule.action === "force_p0") {
      severity = "P0";
      reason.push(`Rule '${rule.name}': forced to P0`);
    } else if (rule.action === "bump") {
      severity = bumpSeverity(severity);
      if (severity !== before) reason.push(`Rule '${rule.name}': bumped from ${before} to ${severity}`);
    } else if (rule.action === "floor_p1") {
      if (severity === "P2" || severity === "P3") {
        severity = "P1";
        reason.push(`Rule '${rule.name}': floored to P1`);
      }
    }
  }

  const ticketTitle = issue.title.length > 80
    ? `${issue.title.slice(0, 80)}...`
    : issue.title;

  return { issueId: issue.id, severity, team, assignee, reason, ticketTitle, confidence };
}
