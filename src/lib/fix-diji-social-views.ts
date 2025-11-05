/**
 * Quick fix utility to resync Diji - Social report views
 * This can be run directly to fix the issue
 */

import { resyncReportViews } from "./resync-report-views";

const DIJI_SOCIAL_REPORT_ID = "8c2f7db9-acbd-4c59-9593-74e8953e7787";
const ROOMSTAY_ACCOUNT_ID = "3998a594-c07c-46b2-937d-fe477b6e9ce7";

/**
 * Fixes the Diji - Social report views to use account-scoped dimensions
 */
export async function fixDijiSocialViews(): Promise<void> {
  console.log("[FIX] Starting fix for Diji - Social report views");
  try {
    await resyncReportViews(DIJI_SOCIAL_REPORT_ID, ROOMSTAY_ACCOUNT_ID);
    console.log("[FIX] Successfully fixed Diji - Social report views");
  } catch (error) {
    console.error("[FIX] Error fixing Diji - Social report views:", error);
    throw error;
  }
}

