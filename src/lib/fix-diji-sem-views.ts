/**
 * Quick fix utility to resync Diji - SEM report views
 * This can be run directly to fix the issue
 */

import { resyncReportViews } from "./resync-report-views";

const DIJI_SEM_REPORT_ID = "3b2a0e45-33be-4eec-911e-b955b951c84e";
const ROOMSTAY_ACCOUNT_ID = "3998a594-c07c-46b2-937d-fe477b6e9ce7";

/**
 * Fixes the Diji - SEM report views to use account-scoped dimensions
 */
export async function fixDijiSEMViews(): Promise<void> {
  console.log("[FIX] Starting fix for Diji - SEM report views");
  try {
    await resyncReportViews(DIJI_SEM_REPORT_ID, ROOMSTAY_ACCOUNT_ID);
    console.log("[FIX] Successfully fixed Diji - SEM report views");
  } catch (error) {
    console.error("[FIX] Error fixing Diji - SEM report views:", error);
    throw error;
  }
}

