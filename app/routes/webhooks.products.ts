import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { invalidateLlmsCache } from "./api.$";

/**
 * Webhook handler for products/create, products/update, products/delete.
 * Invalidates the llms.txt cache so the next request regenerates it.
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { shop, topic } = await authenticate.webhook(request);
    console.log(`Webhook received: ${topic} from ${shop}`);

    invalidateLlmsCache(shop);

    return new Response("OK", { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }
}
