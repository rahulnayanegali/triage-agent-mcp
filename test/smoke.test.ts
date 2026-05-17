import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../src/server.js";

// Fixtures captured from a real triage run
// (Uncaught TypeError: Cannot read properties of null (reading 'useContext'))
const STACK_TRACE = `Uncaught TypeError: Cannot read properties of null (reading 'useContext')
  at e.useContext (_virtual_mf___mfe_internal__remote__loadShare__react__loadShare__.mjs)
  at app-xaIRccHv.js:3:17698`;

const TRACE_LOCATION = {
  filePath: "packages/runtime-core/src/shared/index.ts",
  lineRangeStart: 187,
  lineRangeEnd: 211,
};

const GIT_CONTEXT = {
  commitMessage: "feat: support shared tree shaking (#4084)",
  PR: "feat: support shared tree shaking, PR #4084",
  comments: "",
};

// Pull the first text block out of an MCP tool response
function textOf(result: CallToolResult): string {
  const first = result.content?.[0];
  if (!first || first.type !== "text") {
    throw new Error("expected text content in tool response");
  }
  return first.text;
}

test("happy path: stack trace flows through all three tools end-to-end", async () => {
  // Setup: wire a fake client to the real server via an in-memory transport pair
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createServer();
  await server.connect(serverTransport);
  const client = new Client({ name: "smoke-test", version: "1.0.0" });
  await client.connect(clientTransport);

  try {
    // --- Step 1: blame_stack_trace ---
    const blameResult = (await client.callTool({
      name: "blame_stack_trace",
      arguments: { stackTrace: STACK_TRACE },
    })) as CallToolResult;

    assert.ok(!blameResult.isError, "tool 1 must not error on a valid stack trace");
    const blameText = textOf(blameResult);
    assert.match(blameText, /submit_trace_location/, "tool 1 must point the agent to submit_trace_location next");

    // --- Step 2: submit_trace_location ---
    const locationResult = (await client.callTool({
      name: "submit_trace_location",
      arguments: TRACE_LOCATION,
    })) as CallToolResult;

    assert.ok(!locationResult.isError, "tool 2 must not error on valid location input");
    const locationText = textOf(locationResult);
    assert.match(locationText, /git blame -L 187,211/, "tool 2 must emit the exact git blame command the agent will run");
    assert.match(locationText, /submit_git_context/, "tool 2 must point the agent to submit_git_context next");

    // --- Step 3: submit_git_context ---
    const gitContextResult = (await client.callTool({
      name: "submit_git_context",
      arguments: GIT_CONTEXT,
    })) as CallToolResult;

    assert.ok(!gitContextResult.isError, "tool 3 must not error on valid git context");
    const gitContextText = textOf(gitContextResult);
    const parsed = JSON.parse(gitContextText);
    assert.equal(parsed.commitMessage, GIT_CONTEXT.commitMessage);
    assert.equal(parsed.PR, GIT_CONTEXT.PR);
    assert.equal(parsed.comments, GIT_CONTEXT.comments);
  } finally {
    await client.close();
  }
});
