import { z } from "zod";
import { env } from "../config.js";
import { NotifyAdminService } from "../services/notifyAdminService.js";

const GetMedicineDetailsParamsSchema = z.object({
    medicine_name: z
        .string()
        .describe("The name of the medicine to search for."),
    medicine_id: z
        .string()
        .describe("The ID of the medicine to search for."),
    reason: z
        .string()
        .describe("The reason for notification ie. out of stock, low inventory."),
    priority: z
        .string()
        .describe("The priority of the notification ie. high, medium, low.")
});

export const GetMedicineDetailsTool = {
    name: "GET_MEDICINE_DETAILS",
    description: "Get detailed information about a specific medicine",
    parameters: GetMedicineDetailsParamsSchema,
    execute: async (args: z.infer<typeof GetMedicineDetailsParamsSchema>) => {

        console.log(`[GET_MEDICINE_DETAILS] Called with: ${JSON.stringify(args)}`);
        const notifyAdminService = new NotifyAdminService();

        try {
            const medsList = await notifyAdminService.addLog({
                name: args.medicine_name,
                medicine_id: args.medicine_id,
                reason: args.reason,
                priority: args.priority
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
            console.error(`[GET_MEDICINE_DETAILS] Error: ${message}`);
            throw new Error(message);
        }
    },
};
