#!/usr/bin/env node
import readline from "readline";
// @ts-ignore - dynamic import/typing for langchain
import { GoogleGenerativeAI } from "@google/generative-ai";
import { RetrievalService } from "./src/services/retrievalService.js";

async function main() {
  // Load .env file if available so local environment keys are picked up (GOOGLE_API_KEY / GEMINI_API_KEY)
  try {
    // @ts-ignore - optional dependency; ignore if not installed
    const dotenv = await import('dotenv');
    dotenv.config?.();
    // eslint-disable-next-line no-console
    console.log('✅ Loaded .env (if present)');
  } catch (err) {
    // If a .env file exists but dotenv isn't installed, show a helpful note
    try {
      // @ts-ignore - dynamic import of node builtin
      const fs = await import('fs');
      if (typeof fs.existsSync === 'function' && fs.existsSync('.env')) {
        console.warn('⚠️ Found .env but `dotenv` package is not installed. Install with: pnpm add dotenv');
      }
    } catch (_) {
      // ignore
    }
  }

  console.log("👋 Welcome to PharmAssist chat (experimental)");
  console.log("Type your question (e.g. 'Find medicine for headache') or '/exit' to quit\n");

  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ GOOGLE_API_KEY or GEMINI_API_KEY not set in environment. Exiting.");
    process.exit(1);
  }

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({ model: process.env.GOOGLE_CHAT_MODEL || "chat-bison@001" });
  // Create a chat session with a succinct system instruction that tells the model how to call tools
  // Keep the instruction concise and avoid characters that might trigger API validation.
  const systemInstruction = "You are PharmAssist, an assistant that helps users find medicines and related info.\n\nIf you need external data, call one of these tools using a single-line tool call:\nTOOLCALL: SEARCH_MEDICINES | <query>\nTOOLCALL: GET_MEDICINE_BY_ID | <id>\n\nAfter the tool returns results, continue the conversation using that information. If no tool call is needed, reply normally.";

  const chat = model.startChat({ systemInstruction });

  const parseToolCall = (text: string) => {
    // Try JSON object first: find the first {...} block and try to JSON.parse it
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch[0]);
        if (obj && typeof obj.tool === "string" && typeof obj.input !== "undefined") {
          return { tool: obj.tool, input: String(obj.input) };
        }
      } catch (e) {
        // ignore JSON parse errors and fall back to simple format
      }
    }

    // Fallback: parse simple TOOLCALL format
    // Example: TOOLCALL: SEARCH_MEDICINES | INPUT: headache
    const simpleMatch = text.match(/TOOLCALL:\s*([A-Z_]+)\s*(?:\||:)\s*(?:INPUT:\s*)?(.*)/i);
    if (simpleMatch) {
      return { tool: simpleMatch[1].toUpperCase(), input: simpleMatch[2].trim() };
    }

    return null;
  };

  const rl = (await import("readline")).createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl.setPrompt("You: ");
  rl.prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (trimmed === "/exit" || trimmed === "/quit") {
      console.log("Goodbye 👋");
      rl.close();
      process.exit(0);
    }

    try {
      // send user message
      const assistantResponse = await chat.sendMessage(trimmed);
      const assistantText = (assistantResponse.response?.text && typeof assistantResponse.response.text === 'function') ? assistantResponse.response.text() : String(assistantResponse);
      const assistantTextTrimmed = String(assistantText).trim();

      // Check if assistant wants to call a tool
      const invocation = parseToolCall(assistantText);
      if (invocation) {
        console.log(`🔧 Assistant is invoking tool ${invocation.tool} with input: ${invocation.input}`);
        let toolResult = "";
        if (invocation.tool === "SEARCH_MEDICINES") {
          const retrieval = new RetrievalService();
          await retrieval.initialize();
          toolResult = await (async () => {
            const r = await retrieval.searchMedicines(invocation.input, 5);
            if (r.medicines.length === 0) return `⚠️ No medicines found for \"${invocation.input}\".`;

            let out = `✅ Found ${r.medicines.length} medicine(s) for \"${r.query}\":\n\n`;
            r.medicines.forEach((med, i) => {
              out += `${i + 1}. ${med.product_name}\n   ID: ${med.id}\n   Price: $${med.price}\n   Available: ${med.quantity} units\n   Category: ${med.category_name}\n   Match Score: ${(med.score * 100).toFixed(1)}%\n\n`;
            });
            out += `Search completed in ${r.executionTime}ms`;
            return out;
          })();
        } else if (invocation.tool === "GET_MEDICINE_BY_ID") {
          const retrieval = new RetrievalService();
          await retrieval.initialize();
          const med = await retrieval.getMedicineById(invocation.input.trim());
          toolResult = med ? `✅ Found medicine:\nName: ${med.product_name}\nID: ${med.id}\nPrice: $${med.price}\nQuantity: ${med.quantity}\nCategory: ${med.category_name}` : `⚠️ Medicine with ID ${invocation.input} not found.`;
        } else {
          toolResult = `❌ Unknown tool: ${invocation.tool}`;
        }

        console.log(`Tool result:\n${toolResult}\n`);

        // Provide the tool result back to the assistant and ask it to continue
        const continueResponse = await chat.sendMessage(`TOOL_RESULT: ${toolResult}\n\nPlease continue and use the tool result to answer the user's request.`);
        const contText = (continueResponse.response?.text && typeof continueResponse.response.text === 'function') ? continueResponse.response.text() : String(continueResponse);
        console.log("Assistant:", String(contText).trim());
      } else {
        console.log("Assistant:", assistantText);
      }
    } catch (err) {
      console.error("Error:", (err as Error).message || err);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
