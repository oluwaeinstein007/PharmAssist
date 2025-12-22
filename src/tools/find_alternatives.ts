import { z } from "zod";
import { env } from "../config.js";
import { FindAlternativesService } from "../services/log_purchase.js";

const FindAlternativesParamsSchema = z.object({
    medicine_name: z
        .string()
        .describe("The name of the medicine purchased for."),
    medicine_id: z
        .string()
        .describe("The ID of the medicine purchased for."),
    customer_id: z
        .string()
        .describe("The ID of the customer who made the purchase."),
    purchase_date: z
        .string()
        .describe("The date of purchase in ISO format."),
    quantity: z
        .number()
        .int()
        .positive()
        .describe("The quantity of medicine purchased."),
    total_price: z
        .number()
        .positive()
        .describe("The total price of the purchase."),
});

export const FindAlternativesTool = {
    name: "FIND_ALTERNATIVES",
    description:
        "Find alternative medicines for a given medicine.",
    parameters: FindAlternativesParamsSchema,
    execute: async (args: z.infer<typeof FindAlternativesParamsSchema>) => {

        console.log(`[FIND_ALTERNATIVES] Called with: ${JSON.stringify(args)}`);
        const findAlternativesService = new FindAlternativesService();
        try {
            const medsList = await findAlternativesService.addLog({
                name: args.medicine_name,
                medicine_id: args.medicine_id,
                customer_id: args.customer_id,
                purchase_date: args.purchase_date,
                quantity: args.quantity,
                total_price: args.total_price
            });
            return `
            ✅ Successfully searched medicines with name ${args.medicine_name}.
            Log Meds: ${medsList}
            `;
        } catch (error: unknown) {
            const message =
                error instanceof Error
                    ? error.message
                    : "An unknown error occurred while searching medicines.";
            console.error(`[LOG_PURCHASE] Error: ${message}`);
            throw new Error(message);
        }
    },
};
