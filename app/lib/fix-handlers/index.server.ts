import { handleContentFix } from "./content.server";
import { handleSchemaFix } from "./schema.server";
import { handleMetaFix } from "./meta.server";
import { handleLlmsFix } from "./llms.server";
import { handleAiMetaFix } from "./ai-meta.server";
import { handleNoindexFix } from "./noindex.server";
import { handleRobotsFix } from "./robots.server";

export interface FixRequest {
  fix_type: string;
  url: string;
  shop: string;
  content?: string;
  schema?: string;
  llms_content?: string;
  seo_title?: string;
  seo_description?: string;
  canonical_url?: string;
}

export interface FixResult {
  status: "success" | "failed" | "skipped";
  message: string;
}

interface AdminClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

/**
 * Route a fix request to the appropriate handler.
 */
export async function routeFix(
  admin: AdminClient,
  req: FixRequest,
): Promise<FixResult> {
  const { fix_type } = req;

  switch (fix_type) {
    case "content":
    case "faq":
      return handleContentFix(admin, req);

    case "schema":
      return handleSchemaFix(admin, req);

    case "meta":
      return handleMetaFix(admin, req);

    case "llms":
      return handleLlmsFix(admin, req);

    case "ai_meta":
      return handleAiMetaFix(admin, req);

    case "noindex":
      return handleNoindexFix(admin, req);

    case "robots":
      return handleRobotsFix(admin, req);

    case "canonical":
      return {
        status: "skipped",
        message: "Shopify handles canonical URLs natively. No fix needed.",
      };

    case "viewport":
      return {
        status: "skipped",
        message: "All Shopify themes include viewport meta tag. No fix needed.",
      };

    default:
      return {
        status: "failed",
        message: `Unknown fix type: ${fix_type}`,
      };
  }
}
