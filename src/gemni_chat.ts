// api/src/chat.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export async function chatEndpoint(req, res) {
  const { message } = req.body;

  // 1. Setup MCP Client
  const transport = new StdioClientTransport({
    command: "node",
    args: ["./packages/mcp-server/dist/index.js"],
  });

  const mcpClient = new Client(
    { name: "pharmacy-chat", version: "1.0.0" },
    { capabilities: {} }
  );

  await mcpClient.connect(transport);
  const { tools: mcpTools } = await mcpClient.listTools();

  // 2. Initialize Gemini
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  // Map MCP tools to Gemini tool format
  const declarationTools = {
    functionDeclarations: mcpTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema, // Gemini uses JSON Schema directly
    })),
  };

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash", // or "gemini-1.5-pro"
    systemInstruction: `You are a pharmacy assistant. When customers describe symptoms:
      1. Use search_medicines to find relevant medications
      2. If medicines are out of stock, use notify_restock
      3. Always log purchases with log_purchase`,
    tools: [declarationTools],
  });

  // 3. Start Chat Session
  const chat = model.startChat();
  let result = await chat.sendMessage(message);
  let response = result.response;

  // 4. Handle Tool Calls (Multi-turn)
  const calls = response.functionCalls();
  
  if (calls && calls.length > 0) {
    const toolResponses = [];

    // Execute all requested MCP tools
    for (const call of calls) {
      const toolResult = await mcpClient.callTool({
        name: call.name,
        arguments: call.args,
      });

      toolResponses.push({
        functionResponse: {
          name: call.name,
          response: toolResult.content,
        },
      });
    }

    // Send the tool outputs back to Gemini to get the final text response
    result = await chat.sendMessage(toolResponses);
    response = result.response;
  }

  await mcpClient.close();
  return res.json({ response: response.text() });
}