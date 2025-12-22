// api/src/chat.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export async function chatEndpoint(req, res) {
  const { message, conversation_id } = req.body;

  // Connect to your MCP server
  const transport = new StdioClientTransport({
    command: "node",
    args: ["./packages/mcp-server/dist/index.js"],
  });

  const mcpClient = new Client(
    {
      name: "pharmacy-chat",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  await mcpClient.connect(transport);

  // Get available tools
  const { tools } = await mcpClient.listTools();

  // Initialize Gemini client
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp", // or "gemini-1.5-pro"
    systemInstruction: `You are a pharmacy assistant. When customers describe symptoms:
        1. Use search_medicines to find relevant medications
        2. If medicines are out of stock, use notify_restock
        3. Always log purchases with log_purchase`,
        });

  // Convert MCP tools to Gemini format
  const geminiTools = [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      })),
    },
  ];

  // Start chat with tools
  const chat = model.startChat({
    tools: geminiTools,
    history: [], // You can add conversation history here
  });

  // Send message
  const result = await chat.sendMessage(message);
  const response = result.response;

  // Handle function calls (Gemini's version of tool use)
  const functionCalls = response.functionCalls();

  if (functionCalls && functionCalls.length > 0) {
    // Execute all function calls
    const functionResponses = [];

    for (const call of functionCalls) {
      // Call the tool through MCP
      const toolResult = await mcpClient.callTool({
        name: call.name,
        arguments: call.args,
      });

      functionResponses.push({
        name: call.name,
        response: {
          content: toolResult.content,
        },
      });
    }

    // Continue conversation with function results
    const followUpResult = await chat.sendMessage([
      {
        functionResponses,
      },
    ]);

    await mcpClient.close();
    return res.json({
      response: followUpResult.response.text(),
      functionCalls: functionCalls.map((fc) => ({
        name: fc.name,
        args: fc.args,
      })),
    });
  }

  await mcpClient.close();
  res.json({ response: response.text() });
}