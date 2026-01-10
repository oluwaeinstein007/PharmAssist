import { z } from "zod";
import { CheckStockService } from "../services/checkStockService.js";

const checkStockParamsSchema = z.object({
	medicine_id: z
        .string()
        .describe("The ID of the medicine to check stock for."),
});

export const CheckStockTool = {
	name: "CHECK_STOCK",
	description:
		"Check the stock availability of a specific medicine.",
	parameters: checkStockParamsSchema,
	execute: async (args: z.infer<typeof checkStockParamsSchema>) => {

		console.log(`[CHECK_STOCK] Called with: ${JSON.stringify(args)}`);
		const checkStockService = new CheckStockService();

		try {
			const checkStock = await checkStockService.addLog({
                medicine_id: args.medicine_id,
            });
			return `
			✅ Log added successfully for agent ${args.medicine_id}.
			Log ID: ${checkStock}
			`;
		} catch (error: unknown) {
			const message =
				error instanceof Error
					? error.message
					: "An unknown error occurred while adding agent log.";
			console.error(`[CHECK_STOCK] Error: ${message}`);
			throw new Error(message);
		}
	},
};
