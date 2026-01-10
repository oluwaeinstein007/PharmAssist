const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || 'http://localhost:4000/mcp';

export interface MCPResponse {
  jsonrpc: string;
  id?: number;
  result?: {
    serverInfo?: { name: string; version: string };
    tools?: Array<{ name: string; description: string }>;
    prompts?: Array<{ name: string; description: string }>;
    content?: Array<{ type: string; text?: string }>;
    messages?: Array<{ role: string; content: { type: string; text?: string } }>;
  };
  error?: { code: number; message: string };
}

async function parseSSEResponse(response: Response): Promise<MCPResponse> {
  const text = await response.text();
  
  // If it's plain JSON, parse directly
  if (text.startsWith('{')) {
    return JSON.parse(text);
  }
  
  // Parse SSE format: extract JSON from "event: message\ndata: {...}"
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const jsonStr = line.substring(6);
      if (jsonStr.trim()) {
        return JSON.parse(jsonStr);
      }
    }
  }
  
  throw new Error('No valid JSON found in SSE response');
}

export class MCPClient {
  private sessionId: string | null = null;

  async initialize(): Promise<MCPResponse> {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { sampling: {} },
          clientInfo: { name: 'PharmAssist Web Client', version: '1.0.0' }
        }
      })
    });

    const sessionHeader = response.headers.get('mcp-session-id');
    if (sessionHeader) {
      this.sessionId = sessionHeader;
    }

    const data = await parseSSEResponse(response);
    
    if (data.result) {
      await this.sendNotification('notifications/initialized');
    }

    return data;
  }

  private async sendNotification(method: string): Promise<void> {
    await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...(this.sessionId && { 'mcp-session-id': this.sessionId })
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method
      })
    });
  }

  async listTools(): Promise<MCPResponse> {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...(this.sessionId && { 'mcp-session-id': this.sessionId })
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/list',
        params: {}
      })
    });
    return parseSSEResponse(response);
  }

  async listPrompts(): Promise<MCPResponse> {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...(this.sessionId && { 'mcp-session-id': this.sessionId })
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'prompts/list',
        params: {}
      })
    });
    return parseSSEResponse(response);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...(this.sessionId && { 'mcp-session-id': this.sessionId })
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name, arguments: args }
      })
    });
    return parseSSEResponse(response);
  }

  async getPrompt(name: string, args: Record<string, string>): Promise<MCPResponse> {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...(this.sessionId && { 'mcp-session-id': this.sessionId })
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'prompts/get',
        params: { name, arguments: args }
      })
    });
    return parseSSEResponse(response);
  }
}

export const mcpClient = new MCPClient();
