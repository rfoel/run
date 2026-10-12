import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "./tools.ts";
import INSTRUCTIONS from "./instructions.md";

// Stateless Streamable HTTP: a fresh server + transport per request, since a
// Lambda can't hold sessions in memory across invocations. JSON responses
// instead of SSE — every tool returns in one shot. Auth is handled by the
// /mcp route in api.ts.
export async function handleMcp(req: Request): Promise<Response> {
  const server = new McpServer(
    { name: "run", version: "0.0.1" },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}
