#!/usr/bin/env node
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
	});

	server.addTool(SearchMedsTool);
    server.addTool(CheckStockTool);
    server.addTool(LogPurchaseTool);
    server.addTool(NotifyAdminTool);
    server.addTool(FindAlternativesTool);
    server.addTool(GetMedicineDetailsTool);

	try {
		await server.start({
			transportType: "stdio",
		});
		console.log("👨🏾‍⚕️ PharmAssist MCP Server started successfully over stdio.");
		console.log("You can now connect to it using an MCP client.");
	} catch (error) {
		console.error("❌ Failed to start PharmAssist MCP Server:", error);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("❌ An unexpected error occurred:", error);
	process.exit(1);
});
