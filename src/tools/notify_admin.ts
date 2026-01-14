import { z } from "zod";
import { NotifyAdminService } from "../services/notifyAdminService.js";

const NotifyAdminParamsSchema = z.object({
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

export const NotifyAdminTool = {
    name: "NOTIFY_ADMIN",
    description: "Notify admin when medicine is out of stock or low",
    parameters: NotifyAdminParamsSchema,
    execute: async (args: z.infer<typeof NotifyAdminParamsSchema>) => {

        console.log(`[NOTIFY_ADMIN] Called with: ${JSON.stringify(args)}`);
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
            console.error(`[NOTIFY_ADMIN] Error: ${message}`);
            throw new Error(message);
        }
    },
};
