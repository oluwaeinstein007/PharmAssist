#!/usr/bin/env node
import 'dotenv/config';
import { FastMCP } from "fastmcp";
import { SearchMedsTool } from "./tools/search_meds.js";
import { CheckStockTool } from "./tools/check_stock.js";
import { LogPurchaseTool } from "./tools/log_purchase.js";
import { NotifyAdminTool } from "./tools/notify_admin.js";
import { FindAlternativesTool } from "./tools/find_alternatives.js";
import { GetMedicineDetailsTool } from "./tools/medicine_details.js";

async function main() {
	console.log("Initializing PharmAssist MCP Server...");

	const server = new FastMCP({
		name: "PharmAssist MCP Server",
		version: "0.0.1",
		instructions: `You are PharmAssist, an AI pharmacy assistant. Use the available tools to:
- Search for medicines by name, symptom, or condition using SEARCH_MEDS
- Check stock availability using CHECK_STOCK
- Find alternative medications using FIND_ALTERNATIVES
- Log purchases using LOG_PURCHASE
- Notify admins when needed using NOTIFY_ADMIN
- Get detailed medicine information using GET_MEDICINE_DETAILS

Always provide clear, helpful responses about medications and pharmacy-related queries.`
	});

	// Add existing tools
	server.addTool(SearchMedsTool);
	server.addTool(CheckStockTool);
	server.addTool(LogPurchaseTool);
	server.addTool(NotifyAdminTool);
	server.addTool(FindAlternativesTool);
	server.addTool(GetMedicineDetailsTool);

	// Add pharmacy assistant prompt for chat integration
	server.addPrompt({
		name: "pharmacy-chat",
		description: "Interactive pharmacy assistant for medicine queries",
		arguments: [
			{
				name: "query",
				description: "Medicine name, symptom, or pharmacy question",
				required: true
			}
		],
		load: async (args: { query: string }) => {
			return `Help the user with their pharmacy query: "${args.query}"

Use the SEARCH_MEDS tool to find relevant medicines.
Use CHECK_STOCK to verify availability.
Use FIND_ALTERNATIVES if requested medicine is unavailable.
Always provide clear, helpful responses about medications.`;
		}
	});

	// Determine transport type from environment/args
	const useHttp = process.argv.includes("--http") || process.env.USE_HTTP === "true";
	const port = parseInt(process.env.PORT || "3000");

	try {
		if (useHttp) {
			await server.start({
				httpStream: { port },
				transportType: "httpStream"
			});
			console.log(`PharmAssist MCP Server started on http://localhost:${port}`);
			console.log(`  MCP endpoint: http://localhost:${port}/mcp`);
			console.log(`  Health check: http://localhost:${port}/health`);
		} else {
			await server.start({ transportType: "stdio" });
			console.log("PharmAssist MCP Server started successfully over stdio.");
			console.log("You can now connect to it using an MCP client.");
		}
	} catch (error) {
		console.error("Failed to start PharmAssist MCP Server:", error);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("An unexpected error occurred:", error);
	process.exit(1);
});
