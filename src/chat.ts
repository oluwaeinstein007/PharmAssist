// Simpler approach - call MCP server as HTTP API
import Anthropic from "@anthropic-ai/sdk";

export async function chatEndpoint(req, res) {
  const { message, conversation_id } = req.body;

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Define tools manually (or fetch from your MCP server's schema endpoint)
  const tools = [
    {
      name: "search_medicines",
      description: "Search for medicines based on customer symptoms",
      input_schema: {
        type: "object",
        properties: {
          symptom: { type: "string" },
          limit: { type: "number" }
        },
        required: ["symptom"]
      }
    }
    // ... other tools
  ];

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: `You are a pharmacy assistant...`,
    messages: [{ role: "user", content: message }],
    tools,
  });

  res.json({ response: response.content });
}