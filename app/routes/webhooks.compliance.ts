import type { ActionFunctionArgs } from "@remix-run/node";
import crypto from "crypto";
import { prisma } from "~/shopify.server";

/**
 * Mandatory Shopify GDPR / privacy compliance webhooks.
 *
 * Per Shopify docs (https://shopify.dev/docs/apps/build/webhooks/subscribe/https):
 *  1. Validate HMAC using X-Shopify-Hmac-SHA256 (base64-encoded)
 *  2. Return 200 OK immediately — side effects run async
 *  3. Handle: customers/data_request, customers/redact, shop/redact
 */

function verifyHmac(rawBody: string, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error("[compliance] SHOPIFY_API_SECRET not set");
    return false;
  }

  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "base64"),
      Buffer.from(hmacHeader, "base64"),
    );
  } catch {
    return false;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("X-Shopify-Hmac-SHA256") || "";

  if (!verifyHmac(rawBody, hmacHeader)) {
    console.error("[compliance] HMAC verification failed");
    return new Response("Unauthorized", { status: 401 });
  }

  const topic = request.headers.get("X-Shopify-Topic") || "";
  const shop = request.headers.get("X-Shopify-Shop-Domain") || "unknown";

  // Return 200 immediately — Shopify requires response within 5 seconds
  // All processing runs async after response
  void processComplianceWebhook(topic, shop, rawBody).catch((err) => {
    console.error("[compliance] async processing failed", { topic, shop, err });
  });

  return new Response(null, { status: 200 });
}

async function processComplianceWebhook(
  topic: string,
  shop: string,
  rawBody: string,
) {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // empty or malformed body
  }

  switch (topic) {
    case "customers/data_request": {
      const customerId = (payload as { customer?: { id?: number } })?.customer
        ?.id;
      console.log("[compliance] customers/data_request", {
        shop,
        customerId,
      });
      // Signalor does not store personal customer data — nothing to report
      break;
    }

    case "customers/redact": {
      const customerId = (payload as { customer?: { id?: number } })?.customer
        ?.id;
      console.log("[compliance] customers/redact", { shop, customerId });
      // Signalor does not store personal customer data — nothing to delete
      break;
    }

    case "shop/redact": {
      await prisma.session.deleteMany({ where: { shop } });
      console.log("[compliance] shop/redact — shop data deleted", { shop });
      break;
    }

    default:
      console.log("[compliance] unhandled topic", { topic, shop });
  }
}
