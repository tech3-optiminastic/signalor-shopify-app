import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { invalidateLlmsCache } from "./api.$";

/**
 * Webhook handler for products/create, products/update, products/delete.
 * Invalidates the llms.txt cache so the next request regenerates it.
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { shop, topic, webhookId } = await authenticate.webhook(request);

    void Promise.resolve()
      .then(() => {
        invalidateLlmsCache(shop);
        console.log("[webhooks.products]", { topic, shop, webhookId });
      })
      .catch((err) => console.error("[webhooks.products] async failed", err));

    return new Response("OK", { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }
}
