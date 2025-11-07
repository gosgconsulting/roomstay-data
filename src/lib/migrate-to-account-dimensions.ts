import { supabase } from "@/integrations/supabase/client";

/**
 * Migrate an account from using global dimensions to account-specific dimensions
 * This ensures data integrity while transitioning to the new account-scoped model
 */
export async function migrateAccountToAccountDimensions(accountId: string): Promise<boolean> {
  try {
    console.log('[MIGRATION] Starting migration for account:', accountId);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('[MIGRATION] No user found');
      return false;
    }

    // Step 1: Check if account already has account-specific dimensions
    const { data: existingAccountDims, error: checkError } = await supabase
      .from('dimensions')
      .select('id, name')
      .eq('scope', 'account')
      .eq('account_id', accountId);

    if (checkError) {
      console.error('[MIGRATION] Error checking existing dimensions:', checkError);
      return false;
    }

    console.log('[MIGRATION] Found existing account dimensions:', existingAccountDims?.length || 0);

    // Step 2: Get all global dimensions that should be cloned
    const { data: globalDimensions, error: globalError } = await supabase
      .from('dimensions')
      .select('*')
      .eq('scope', 'global');

    if (globalError) {
      console.error('[MIGRATION] Error loading global dimensions:', globalError);
      return false;
    }

    if (!globalDimensions || globalDimensions.length === 0) {
      console.log('[MIGRATION] No global dimensions found to migrate');
      return true;
    }

    console.log('[MIGRATION] Found global dimensions to migrate:', globalDimensions.length);

    // Step 3: Create account-specific versions of global dimensions that don't already exist
    const existingNames = new Set(existingAccountDims?.map(d => d.name) || []);
    const dimensionsToCreate = globalDimensions.filter(d => !existingNames.has(d.name));

    if (dimensionsToCreate.length === 0) {
      console.log('[MIGRATION] All global dimensions already have account-specific versions');
      return true;
    }

    console.log('[MIGRATION] Creating account dimensions for:', dimensionsToCreate.map(d => d.name));

    const accountDimensions = dimensionsToCreate.map(d => ({
      name: d.name,
      type: d.type,
      formula: d.formula,
      scope: 'account',
      account_id: accountId,
      user_id: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const { error: insertError } = await supabase
      .from('dimensions')
      .insert(accountDimensions);

    if (insertError) {
      console.error('[MIGRATION] Error creating account dimensions:', insertError);
      return false;
    }

    console.log('[MIGRATION] Successfully created', accountDimensions.length, 'account-specific dimensions');

    // Step 4: Update any report views that might be using global dimension IDs
    await migrateReportViewDimensions(accountId);

    return true;
  } catch (error) {
    console.error('[MIGRATION] Unexpected error during migration:', error);
    return false;
  }
}

/**
 * Update report views to use account-specific dimension IDs instead of global ones
 */
async function migrateReportViewDimensions(accountId: string): Promise<void> {
  try {
    console.log('[MIGRATION] Migrating report view dimensions for account:', accountId);

    // Get all reports for this account
    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('id')
      .eq('account_id', accountId);

    if (reportsError || !reports) {
      console.error('[MIGRATION] Error loading reports:', reportsError);
      return;
    }

    // Get all report views for these reports
    const reportIds = reports.map(r => r.id);
    const { data: reportViews, error: viewsError } = await supabase
      .from('report_views')
      .select('*')
      .in('report_id', reportIds);

    if (viewsError || !reportViews) {
      console.error('[MIGRATION] Error loading report views:', viewsError);
      return;
    }

    console.log('[MIGRATION] Found report views to check:', reportViews.length);

    // Get dimension mapping (global ID -> account ID)
    const { data: globalDims } = await supabase
      .from('dimensions')
      .select('id, name')
      .eq('scope', 'global');

    const { data: accountDims } = await supabase
      .from('dimensions')
      .select('id, name')
      .eq('scope', 'account')
      .eq('account_id', accountId);

    if (!globalDims || !accountDims) return;

    // Create mapping from global dimension names to account dimension IDs
    const nameToAccountId = new Map<string, string>();
    accountDims.forEach(dim => {
      nameToAccountId.set(dim.name, dim.id);
    });

    const nameToGlobalId = new Map<string, string>();
    globalDims.forEach(dim => {
      nameToGlobalId.set(dim.name, dim.id);
    });

    // Update each report view
    for (const view of reportViews) {
      let needsUpdate = false;
      const updates: any = {};

      // Migrate group_by_dimensions
      if (view.group_by_dimensions && view.group_by_dimensions.length > 0) {
        const migratedGroupBy = view.group_by_dimensions.map((dimId: string) => {
          const globalDim = globalDims.find(d => d.id === dimId);
          if (globalDim && nameToAccountId.has(globalDim.name)) {
            needsUpdate = true;
            return nameToAccountId.get(globalDim.name);
          }
          return dimId;
        });
        if (needsUpdate) updates.group_by_dimensions = migratedGroupBy;
      }

      // Migrate breakdown_by_dimensions
      if (view.breakdown_by_dimensions && view.breakdown_by_dimensions.length > 0) {
        const migratedBreakdown = view.breakdown_by_dimensions.map((dimId: string) => {
          const globalDim = globalDims.find(d => d.id === dimId);
          if (globalDim && nameToAccountId.has(globalDim.name)) {
            needsUpdate = true;
            return nameToAccountId.get(globalDim.name);
          }
          return dimId;
        });
        if (needsUpdate) updates.breakdown_by_dimensions = migratedBreakdown;
      }

      // Migrate then_by_dimensions
      if (view.then_by_dimensions && view.then_by_dimensions.length > 0) {
        const migratedThenBy = view.then_by_dimensions.map((dimId: string) => {
          const globalDim = globalDims.find(d => d.id === dimId);
          if (globalDim && nameToAccountId.has(globalDim.name)) {
            needsUpdate = true;
            return nameToAccountId.get(globalDim.name);
          }
          return dimId;
        });
        if (needsUpdate) updates.then_by_dimensions = migratedThenBy;
      }

      // Migrate visible_columns
      if (view.visible_columns && view.visible_columns.length > 0) {
        const migratedColumns = view.visible_columns.map((dimId: string) => {
          const globalDim = globalDims.find(d => d.id === dimId);
          if (globalDim && nameToAccountId.has(globalDim.name)) {
            needsUpdate = true;
            return nameToAccountId.get(globalDim.name);
          }
          return dimId;
        });
        if (needsUpdate) updates.visible_columns = migratedColumns;
      }

      // Migrate column_order
      if (view.column_order && view.column_order.length > 0) {
        const migratedOrder = view.column_order.map((dimId: string) => {
          const globalDim = globalDims.find(d => d.id === dimId);
          if (globalDim && nameToAccountId.has(globalDim.name)) {
            needsUpdate = true;
            return nameToAccountId.get(globalDim.name);
          }
          return dimId;
        });
        if (needsUpdate) updates.column_order = migratedOrder;
      }

      // Update the view if needed
      if (needsUpdate) {
        const { error: updateError } = await supabase
          .from('report_views')
          .update(updates)
          .eq('id', view.id);

        if (updateError) {
          console.error('[MIGRATION] Error updating report view:', view.id, updateError);
        } else {
          console.log('[MIGRATION] Updated report view:', view.id);
        }
      }
    }

    console.log('[MIGRATION] Report view migration completed');
  } catch (error) {
    console.error('[MIGRATION] Error migrating report view dimensions:', error);
  }
}

/**
 * Migrate all accounts to use account-specific dimensions
 */
export async function migrateAllAccountsToAccountDimensions(): Promise<void> {
  try {
    console.log('[MIGRATION] Starting migration for all accounts');

    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, name');

    if (accountsError || !accounts) {
      console.error('[MIGRATION] Error loading accounts:', accountsError);
      return;
    }

    console.log('[MIGRATION] Found accounts to migrate:', accounts.length);

    for (const account of accounts) {
      console.log('[MIGRATION] Migrating account:', account.name);
      const success = await migrateAccountToAccountDimensions(account.id);
      if (!success) {
        console.error('[MIGRATION] Failed to migrate account:', account.name);
      }
    }

    console.log('[MIGRATION] Migration completed for all accounts');
  } catch (error) {
    console.error('[MIGRATION] Error in bulk migration:', error);
  }
}
