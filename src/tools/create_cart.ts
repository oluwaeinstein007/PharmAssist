import { z } from "zod";
import { CreateCartService, type CartItem } from "../services/createCartService.js";

const cartItemSchema = z.object({
  barcode: z.string().describe("The barcode of the medicine"),
  qty: z.union([z.string(), z.number()]).describe("The quantity of the medicine"),
});

const createCartParamsSchema = z.object({
  items: z
    .array(cartItemSchema)
    .describe("Array of items to add to the cart, each with barcode and quantity"),
});

export const CreateCartTool = {
  name: "CREATE_CART",
  description:
    "Create a shopping cart with medicine items. Each item requires a barcode and quantity.",
  parameters: createCartParamsSchema,
  execute: async (args: z.infer<typeof createCartParamsSchema>) => {
    console.log(`[CREATE_CART] Called with: ${JSON.stringify(args)}`);

    const createCartService = new CreateCartService();

    try {
      const cartItems: CartItem[] = args.items.map(item => ({
        barcode: item.barcode,
        qty: item.qty,
      }));

      const result = await createCartService.createCart(cartItems);

      if (result.success) {
        return `
✅ Cart created successfully!
Cart ID (UID): ${result.cartId}
Items: ${args.items.map(item => `${item.barcode} (qty: ${item.qty})`).join(", ")}
${
  result.cartUrl
    ? `\n🛒 Complete your transaction here: ${result.cartUrl}`
    : ""
}
`;
      } else {
        throw new Error(result.error || "Failed to create cart");
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "An unknown error occurred while creating the cart.";
      console.error(`[CREATE_CART] Error: ${message}`);
      throw new Error(message);
    }
  },
};
