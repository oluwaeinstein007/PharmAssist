import { z } from "zod";
import { env } from "../config.js";
import { SearchMedsService } from "../services/search_meds.js";

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
		// const apiKey = env.API_KEY;
		// if (!apiKey) {
		// 	throw new Error(
		// 		"API_KEY is not set. Please set it in your environment variables.",
		// 	);
		// }
		console.log(`[SEARCH_MEDS] Called with: ${JSON.stringify(args)}`);
		const searchMedsService = new SearchMedsService();

		try {
			const medsList = await searchMedsService.addLog({
				name: args.name,
                id: args.id,
                // apiKey: apiKey,
			});
			return `
            ✅ Successfully searched medicines with name ${args.name}.
			Log Meds: ${medsList}
			`;
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
