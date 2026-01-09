#!/usr/bin/env node
import { GoogleGenerativeAI } from "@google/generative-ai";

async function test() {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_API_KEY or GEMINI_API_KEY not set');
    process.exit(1);
  }

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({ model: process.env.GOOGLE_CHAT_MODEL || "chat-bison@001" });

  const systemInstruction = "You are PharmAssist, an assistant that helps users find medicines and related info.\n\nIf you need external data, call one of these tools using a single-line tool call:\nTOOLCALL: SEARCH_MEDICINES | <query>\nTOOLCALL: GET_MEDICINE_BY_ID | <id>\n\nAfter the tool returns results, continue the conversation using that information. If no tool call is needed, reply normally.";

  const chat = model.startChat({ systemInstruction });

  try {
    const response = await chat.sendMessage('Tell me about yourself');
    const assistantText = (response.response?.text && typeof response.response.text === 'function') ? response.response.text() : String(response);
    console.log('Assistant:', assistantText);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();
