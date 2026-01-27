import { z } from "zod";
import { CheckStockService } from "../services/checkStockService.js";

const checkStockParamsSchema = z.object({
	medicine_barcode: z
        .string()
        .describe("The barcode of the medicine to check stock for."),
});

export const CheckStockTool = {
	name: "CHECK_STOCK",
	description:
		"Check the stock availability and price of a specific medicine by its barcode.",
	parameters: checkStockParamsSchema,
	execute: async (args: z.infer<typeof checkStockParamsSchema>) => {

		console.log(`[CHECK_STOCK] Called with: ${JSON.stringify(args)}`);
		const checkStockService = new CheckStockService();

		try {
			const result = await checkStockService.checkStock({
                medicine_barcode: args.medicine_barcode,
            });

			if (!result.success) {
				return `
❌ Failed to check stock for barcode ${args.medicine_barcode}.
Error: ${result.error}
				`.trim();
			}

			const { data } = result;
			return `
✅ Stock Check Result for Barcode: ${data?.barcode}

**Product:** ${data?.product_name}
**Category:** ${data?.category_name}
**Price:** ₦${data?.price}
**Available Quantity:** ${data?.quantity} units

${data?.quantity && data.quantity > 0 ? '✨ In stock and ready to order!' : '⚠️ Out of stock'}
			`.trim();
		} catch (error: unknown) {
			const message =
				error instanceof Error
					? error.message
					: "An unknown error occurred while checking stock.";
			console.error(`[CHECK_STOCK] Error: ${message}`);
			throw new Error(message);
		}
	},
};
