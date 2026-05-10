import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main() {
  const server = new McpServer({
    name: "triage-agent-mcp",
    version: "0.2.0",
  });

  await server.connect(new StdioServerTransport());
}

main();
