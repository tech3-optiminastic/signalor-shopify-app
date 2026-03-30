import { json } from "@remix-run/node";
import { prisma } from "~/shopify.server";

/**
 * GET /api/health — Public health check.
 * Backend can ping this to verify the app is reachable.
 */
export async function loader() {
  try {
    // Quick DB check
    const sessionCount = await prisma.session.count();
    return json({
      ok: true,
      app: "signalor-shopify",
      version: "1.0.0",
      sessions: sessionCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return json({
      ok: false,
      app: "signalor-shopify",
      error: "Database connection failed",
    }, 500);
  }
}
