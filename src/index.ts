import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parseTriageConfig, classifyIssue } from "./classifier.js";
import type { IssueData, TriageResult } from "./classifier.js";

function loadTriageContext(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(__dirname, "../triage-context.md"),
    resolve(process.cwd(), "triage-context.md"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf-8");
  }
  throw new Error(
    "triage-context.md not found. Copy triage-context.example.md to triage-context.md and edit it with your team's routes."
  );
}

function formatResult(result: TriageResult): string {
  const reasons = result.reason.map((r) => `- ${r}`).join("\n");
  return [
    "## Triage result",
    "",
    `**Issue:** ${result.ticketTitle}`,
    `**Severity:** ${result.severity}`,
    `**Team:** ${result.team}`,
    `**Assignee:** ${result.assignee}`,
    `**Confidence:** ${result.confidence}`,
    "",
    "### Reasons",
    reasons,
  ].join("\n");
}

async function main() {
  let raw: string;
  try {
    raw = loadTriageContext();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const config = parseTriageConfig(raw);

  const server = new McpServer({
    name: "triage-agent-mcp",
    version: "0.1.0",
  });

  server.tool(
    "triage_issue",
    "Classify a Sentry issue by severity P0-P3 and route to the owning team using rules from triage-context.md. Pass the issue data pre-fetched from Sentry. Returns severity, team, assignee, and the reasons behind the decision.",
    {
      id:          z.string().describe("Sentry issue ID"),
      title:       z.string().describe("Issue title from Sentry"),
      culprit:     z.string().describe("Culprit field from Sentry"),
      eventCount:  z.number().describe("Total event count"),
      userCount:   z.number().describe("Number of affected users"),
      environment: z.string().optional().describe("Environment name e.g. production"),
      url:         z.string().optional().describe("URL where the error occurred"),
    },
    (input) => {
      const issue: IssueData = {
        id:          input.id,
        title:       input.title,
        culprit:     input.culprit,
        eventCount:  input.eventCount,
        userCount:   input.userCount,
        environment: input.environment,
        url:         input.url,
      };
      const result = classifyIssue(issue, config);
      return { content: [{ type: "text", text: formatResult(result) }] };
    }
  );

  try {
    await server.connect(new StdioServerTransport());
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
