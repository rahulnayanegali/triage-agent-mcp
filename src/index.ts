import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const locationSchema = z.object({
  filePath: z.string().min(1),
  lineRange: z.object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  }),
});

const gitContextSchema = z.object({
  commitMessage: z.string().min(1),
  PR: z
    .string()
    .describe("PR title, number, and URL if available, otherwise empty string"),
  comments: z
    .string()
    .describe("Relevant PR or commit comments, otherwise empty string"),
});

async function main() {
  const server = new McpServer({
    name: "triage-agent-mcp",
    version: "0.2.0",
  });

  server.registerTool(
    "blame_stack_trace",
    {
      title: "Blame Stack Trace",
      description:
        "Step 1 of 2. Pass in a stack trace and receive instructions on what to find. " +
        "Then call submit_trace_location with the result.",
      inputSchema: {
        stackTrace: z.string().describe("The raw stack trace from the error"),
      },
    },
    async ({ stackTrace }) => {
      const instructions = `Analyze the following stack trace and identify the single most relevant source file and line number (prefer application code over node_modules).

Stack trace:
${stackTrace}

Once you have identified the location, call the \`submit_trace_location\` tool with:
{
  "filePath": "<relative or absolute path to the source file>",
  "lineRange": {
    "start": <primary line number minus 2>,
    "end": <primary line number plus 2>
  }
}

Both start and end must be positive integers.`;

      return {
        content: [{ type: "text" as const, text: instructions }],
      };
    },
  );

  server.registerTool(
    "submit_trace_location",
    {
      title: "Submit Trace Location",
      description:
        "Step 2 of 2. Submit the file path and line range you identified from the stack trace. " +
        "The location is validated and returned as the final result.",
      inputSchema: {
        filePath: z
          .string()
          .min(1)
          .describe("Path to the source file identified in the stack trace"),
        lineRangeStart: z
          .number()
          .int()
          .positive()
          .describe("Start line number (primary line minus 2)"),
        lineRangeEnd: z
          .number()
          .int()
          .positive()
          .describe("End line number (primary line plus 2)"),
      },
    },
    async ({ filePath, lineRangeStart, lineRangeEnd }) => {
      const parsed = locationSchema.safeParse({
        filePath,
        lineRange: { start: lineRangeStart, end: lineRangeEnd },
      });

      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Invalid location: ${parsed.error.message}`,
            },
          ],
        };
      }

      const { lineRange } = parsed.data;
      const instructions = `Location confirmed: ${filePath} lines ${lineRange.start}-${lineRange.end}.

Now fetch the git context for that location:

1. Run: git blame -L ${lineRange.start},${lineRange.end} -- ${filePath}
   Extract the commit hash from the output.

2. Run: git log -1 --format="%s%n%b" <commit-hash>
   Capture the full commit message.

3. Run: git log -1 --format="%H" <commit-hash>
   Use the hash to find the associated PR (e.g. via gh pr list --search <hash> or gh pr view if the branch is known).
   Capture the PR title, number, and URL.

4. Fetch any comments on that PR via: gh pr view <number> --comments
   Capture relevant reviewer comments.

Once you have all of the above, call \`submit_git_context\` with:
{
  "commitMessage": "<full commit message>",
  "PR": "<PR title, number, and URL — empty string if none found>",
  "comments": "<relevant PR/commit comments — empty string if none>"
}`;

      return {
        content: [{ type: "text" as const, text: instructions }],
      };
    },
  );

  server.registerTool(
    "submit_git_context",
    {
      title: "Submit Git Context",
      description:
        "Step 3 of 3. Submit the commit message, PR info, and comments found via git blame/log. " +
        "The context is validated and returned as the final triage result.",
      inputSchema: {
        commitMessage: z
          .string()
          .min(1)
          .describe("Full commit message for the blamed commit"),
        PR: z
          .string()
          .describe("PR title, number, and URL — empty string if none found"),
        comments: z
          .string()
          .describe("Relevant PR or commit comments — empty string if none"),
      },
    },
    async ({ commitMessage, PR, comments }) => {
      const parsed = gitContextSchema.safeParse({
        commitMessage,
        PR,
        comments,
      });

      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Invalid git context: ${parsed.error.message}`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(parsed.data) }],
      };
    },
  );

  await server.connect(new StdioServerTransport());
}

main();
