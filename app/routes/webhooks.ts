import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { prisma } from "~/shopify.server";

/**
 * Shopify webhook handler — app/uninstalled and mandatory compliance webhooks (GDPR).
 * authenticate.webhook verifies HMAC; invalid signatures must surface as 401 per Shopify requirements.
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { topic, shop } = await authenticate.webhook(request);

    switch (topic) {
      case "APP_UNINSTALLED":
      case "app/uninstalled":
        await prisma.session.deleteMany({ where: { shop } });
        console.log(`App uninstalled from ${shop} — sessions cleaned up`);
        break;

      case "CUSTOMERS_DATA_REQUEST":
      case "CUSTOMERS_REDACT":
      case "SHOP_REDACT":
      case "customers/data_request":
      case "customers/redact":
      case "shop/redact":
        console.log(`Compliance webhook ${topic} for ${shop} — acknowledged`);
        break;

      default:
        console.log(`Webhook ${topic} for ${shop}`);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }
}
