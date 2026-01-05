import { z } from "zod";
import { RetrievalService } from "../services/retrievalService.js";

const SearchMedsParamsSchema = z.object({
	name: z
		.string()
		.describe("The name of the medicine to search for."),
    id: z
        .string()
        // .number()
		// .int()
		// .positive()
		.optional()
        .describe("The ID of the medicine to search for."),
});

export const SearchMedsTool = {
	name: "SEARCH_MEDS",
	description:
		"Search for medicines based on symptoms or conditions.",
	parameters: SearchMedsParamsSchema,
	execute: async (args: z.infer<typeof SearchMedsParamsSchema>) => {
		console.log(`[SEARCH_MEDS] Called with: ${JSON.stringify(args)}`);
		const retrievalService = new RetrievalService();

		try {
			// Initialize the retrieval service
			await retrievalService.initialize();

			let result;
			
			// If ID is provided, fetch specific medicine
			if (args.id) {
				result = await retrievalService.getMedicineById(args.id);
				if (!result) {
					return `❌ Medicine with ID ${args.id} not found.`;
				}
				return `
					✅ Found medicine:
					Name: ${result.product_name}
					Barcode: ${result.barcode}
					Price: $${result.price}
					Quantity: ${result.quantity}
					Category: ${result.category_name}
					Match Score: ${(result.score * 100).toFixed(1)}%
				`.trim();
			}

			// Otherwise, search by name
			const searchResult = await retrievalService.searchMedicines(args.name, 5);
			
			if (searchResult.medicines.length === 0) {
				return `⚠️  No medicines found for "${args.name}".`;
			}

			// Format results
			let response = `✅ Found ${searchResult.medicines.length} medicine(s) for "${args.name}":\n\n`;
			searchResult.medicines.forEach((med, index) => {
				response += `${index + 1}. ${med.product_name}
					Barcode: ${med.barcode}
					Price: $${med.price}
					Available: ${med.quantity} units
					Category: ${med.category_name}
					Match Score: ${(med.score * 100).toFixed(1)}%\n`;
				});

			response += `\nSearch completed in ${searchResult.executionTime}ms`;
			return response;
		} catch (error: unknown) {
			const message =
				error instanceof Error
					? error.message
					: "An unknown error occurred while searching medicines.";
			console.error(`[SEARCH_MEDS] Error: ${message}`);
			throw new Error(message);
		}
	},
};
