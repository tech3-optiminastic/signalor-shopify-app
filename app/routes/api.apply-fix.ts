import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticateSignalor } from "~/lib/signalor-auth.server";
import { routeFix } from "~/lib/fix-handlers/index.server";
import type { FixRequest } from "~/lib/fix-handlers/index.server";
import { prisma } from "~/shopify.server";

/**
 * POST /api/apply-fix
 *
 * Receives fix instructions from the Signalor backend.
 * Authenticated via HMAC signature (X-Signalor-Signature header).
 *
 * Mirrors WordPress plugin's POST /wp-json/signalor/v1/apply-fix
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ status: "failed", message: "Method not allowed" }, 405);
  }

  try {
    // Verify HMAC + get access token
    const { auth, body } = await authenticateSignalor(request);

    const fixReq = body as unknown as FixRequest;
    if (!fixReq.fix_type) {
      return json({ status: "failed", message: "fix_type is required" }, 400);
    }

    // Create an authenticated admin client using the offline session token
    const adminClient = createAdminClient(auth.shop, auth.accessToken);

    // Route to the appropriate fix handler
    const result = await routeFix(adminClient, fixReq);

    // Log the fix attempt
    await prisma.fixLog.create({
      data: {
        shop: auth.shop,
        fixType: fixReq.fix_type,
        url: fixReq.url || "",
        status: result.status,
        message: result.message,
      },
    });

    return json(result);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("apply-fix error:", error);
    return json(
      { status: "failed", message: String(error) },
      500,
    );
  }
}

/**
 * Create a simple admin GraphQL client using the stored offline access token.
 */
function createAdminClient(shop: string, accessToken: string) {
  return {
    async graphql(query: string, options?: { variables?: Record<string, unknown> }) {
      const resp = await fetch(
        `https://${shop}/admin/api/2024-10/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({ query, variables: options?.variables }),
        },
      );
      return resp;
    },
  };
}

// Reject GET requests
export async function loader() {
  return json({ error: "POST only" }, 405);
}
