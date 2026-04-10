import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, prisma } from "~/shopify.server";

/**
 * Mandatory GDPR / privacy compliance webhooks only.
 * @see https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { topic, shop } = await authenticate.webhook(request);

    switch (topic) {
      case "CUSTOMERS_DATA_REQUEST":
      case "customers/data_request":
        console.log(`customers/data_request for ${shop} — no stored customer data`);
        break;

      case "CUSTOMERS_REDACT":
      case "customers/redact":
        console.log(`customers/redact for ${shop} — acknowledged`);
        break;

      case "SHOP_REDACT":
      case "shop/redact":
        await prisma.session.deleteMany({ where: { shop } });
        await prisma.fixLog.deleteMany({ where: { shop } });
        console.log(`shop/redact for ${shop} — shop data removed`);
        break;

      default:
        console.log(`Unexpected topic on compliance route: ${topic} for ${shop}`);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    throw error;
  }
}
