import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

function extractLocationFromStackTrace(stackTrace: string): {
  filePath: string;
  lineRange: { start: number; end: number };
} {
  // Match patterns like: at Foo (path/to/file.js:36:13) or path/to/file.jsx:36
  const patterns = [
    /at\s+\S+\s+\((.+?):(\d+):\d+\)/,   // at Foo (file.js:36:13)
    /at\s+(.+?):(\d+):\d+/,              // at file.js:36:13
    /(\S+\.\w+):(\d+)/,                  // file.jsx:36
  ];

  for (const pattern of patterns) {
    const match = stackTrace.match(pattern);
    if (match) {
      const line = parseInt(match[2], 10);
      return {
        filePath: match[1],
        lineRange: { start: Math.max(1, line - 2), end: line + 2 },
      };
    }
  }

  throw new Error("Could not extract file location from stack trace");
}

async function main() {
  const server = new McpServer({
    name: "triage-agent-mcp",
    version: "0.2.0",
  });

  server.registerTool(
    "blame_stack_trace",
    {
      title: "Blame Stack Trace",
      description: "Given a stack trace, extracts the most relevant file path and line range, then returns them for git blame.",
      inputSchema: { stackTrace: z.string().describe("The raw stack trace from the error") },
    },
    async ({ stackTrace }) => {
      const location = extractLocationFromStackTrace(stackTrace);
      return {
        content: [{ type: "text", text: JSON.stringify(location) }],
      };
    }
  );

  await server.connect(new StdioServerTransport());
}

main();
