import { supabase } from "@/integrations/supabase/client";

export interface ReportDiagnostics {
  reportId: string;
  reportExists: boolean;
  accountId: string | null;
  dimensionCount: number;
  dataRowCount: number;
  dimensionIds: string[];
  sampleData: any[];
  errors: string[];
  warnings: string[];
}

/**
 * Comprehensive diagnostic function to debug report loading issues
 */
export async function diagnoseReportIssues(reportId: string): Promise<ReportDiagnostics> {
  const diagnostics: ReportDiagnostics = {
    reportId,
    reportExists: false,
    accountId: null,
    dimensionCount: 0,
    dataRowCount: 0,
    dimensionIds: [],
    sampleData: [],
    errors: [],
    warnings: []
  };

  try {
    console.log('[DIAGNOSTICS] Starting diagnosis for report:', reportId);

    // 1. Check if report exists
    try {
      const { data: reportData, error: reportError } = await supabase
        .from('reports')
        .select('id, name, account_id, user_id, created_at')
        .eq('id', reportId)
        .single();

      if (reportError) {
        diagnostics.errors.push(`Report fetch error: ${reportError.message}`);
      } else if (reportData) {
        diagnostics.reportExists = true;
        diagnostics.accountId = reportData.account_id;
        console.log('[DIAGNOSTICS] Report found:', reportData.name, 'Account:', reportData.account_id);
      } else {
        diagnostics.errors.push('Report not found');
      }
    } catch (reportCheckError) {
      diagnostics.errors.push(`Report check failed: ${reportCheckError}`);
    }

    // 2. Check dimensions
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        diagnostics.errors.push('User not authenticated');
        return diagnostics;
      }

      // Load all dimension types
      const dimensionQueries = [
        // Account dimensions
        diagnostics.accountId ? supabase
          .from('dimensions')
          .select('*')
          .eq('scope', 'account')
          .eq('account_id', diagnostics.accountId) : null,
        
        // Global dimensions
        supabase
          .from('dimensions')
          .select('*')
          .eq('scope', 'global'),
        
        // Custom dimensions
        supabase
          .from('dimensions')
          .select('*')
          .eq('user_id', user.id)
          .eq('scope', 'custom')
          .eq('report_id', reportId)
      ];

      const dimensionResults = await Promise.allSettled(
        dimensionQueries.filter(q => q !== null).map(q => q!)
      );

      let allDimensions: any[] = [];
      dimensionResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { data, error } = result.value;
          if (error) {
            diagnostics.warnings.push(`Dimension query ${index} error: ${error.message}`);
          } else if (data) {
            allDimensions = [...allDimensions, ...data];
          }
        } else {
          diagnostics.warnings.push(`Dimension query ${index} failed: ${result.reason}`);
        }
      });

      diagnostics.dimensionCount = allDimensions.length;
      diagnostics.dimensionIds = allDimensions.map(d => d.id);
      
      console.log('[DIAGNOSTICS] Found dimensions:', {
        total: allDimensions.length,
        byScope: allDimensions.reduce((acc, d) => {
          acc[d.scope] = (acc[d.scope] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      });

    } catch (dimensionCheckError) {
      diagnostics.errors.push(`Dimension check failed: ${dimensionCheckError}`);
    }

    // 3. Check data rows
    try {
      const { data: dataRows, error: dataError } = await supabase
        .from('dimension_data')
        .select('dimension_values, row_number, data_source_id')
        .eq('report_id', reportId)
        .limit(5); // Get sample data

      if (dataError) {
        diagnostics.errors.push(`Data fetch error: ${dataError.message}`);
      } else if (dataRows) {
        diagnostics.dataRowCount = dataRows.length;
        diagnostics.sampleData = dataRows;

        // Analyze dimension IDs in data
        const dataUsedDimIds = new Set<string>();
        dataRows.forEach(row => {
          if (row.dimension_values) {
            Object.keys(row.dimension_values).forEach(dimId => {
              dataUsedDimIds.add(dimId);
            });
          }
        });

        console.log('[DIAGNOSTICS] Data analysis:', {
          rowCount: dataRows.length,
          uniqueDimensionIds: dataUsedDimIds.size,
          dimensionIdsInData: Array.from(dataUsedDimIds)
        });

        // Check for dimension ID mismatches
        const currentDimIds = new Set(diagnostics.dimensionIds);
        const missingInCurrent = Array.from(dataUsedDimIds).filter(id => !currentDimIds.has(id));
        const missingInData = diagnostics.dimensionIds.filter(id => !dataUsedDimIds.has(id));

        if (missingInCurrent.length > 0) {
          diagnostics.warnings.push(`Dimension IDs in data but not in current dimensions: ${missingInCurrent.join(', ')}`);
        }
        if (missingInData.length > 0) {
          diagnostics.warnings.push(`Dimension IDs in current dimensions but not in data: ${missingInData.join(', ')}`);
        }
      }

      // Get total row count
      const { count, error: countError } = await supabase
        .from('dimension_data')
        .select('*', { count: 'exact', head: true })
        .eq('report_id', reportId);

      if (countError) {
        diagnostics.warnings.push(`Count query error: ${countError.message}`);
      } else {
        diagnostics.dataRowCount = count || 0;
      }

    } catch (dataCheckError) {
      diagnostics.errors.push(`Data check failed: ${dataCheckError}`);
    }

    // 4. Check data sources
    try {
      const { data: dataSources, error: dsError } = await supabase
        .from('data_sources')
        .select('id, name, source_type, last_synced_at')
        .eq('report_id', reportId);

      if (dsError) {
        diagnostics.warnings.push(`Data source check error: ${dsError.message}`);
      } else if (dataSources) {
        console.log('[DIAGNOSTICS] Data sources:', dataSources.length, dataSources);
        if (dataSources.length === 0) {
          diagnostics.warnings.push('No data sources found for this report');
        }
      }
    } catch (dsCheckError) {
      diagnostics.warnings.push(`Data source check failed: ${dsCheckError}`);
    }

    console.log('[DIAGNOSTICS] Diagnosis complete:', diagnostics);
    return diagnostics;

  } catch (error) {
    diagnostics.errors.push(`Diagnostic failed: ${error}`);
    console.error('[DIAGNOSTICS] Diagnostic error:', error);
    return diagnostics;
  }
}

/**
 * Log comprehensive diagnostics for a report
 */
export async function logReportDiagnostics(reportId: string): Promise<void> {
  const diagnostics = await diagnoseReportIssues(reportId);
  
  console.group(`🔍 REPORT DIAGNOSTICS: ${reportId}`);
  console.log('📊 Report Status:', diagnostics.reportExists ? '✅ Found' : '❌ Not Found');
  console.log('🏢 Account ID:', diagnostics.accountId || 'None');
  console.log('📏 Dimensions:', diagnostics.dimensionCount);
  console.log('📋 Data Rows:', diagnostics.dataRowCount);
  
  if (diagnostics.dimensionIds.length > 0) {
    console.log('🔑 Dimension IDs:', diagnostics.dimensionIds);
  }
  
  if (diagnostics.sampleData.length > 0) {
    console.log('📄 Sample Data:', diagnostics.sampleData);
  }
  
  if (diagnostics.errors.length > 0) {
    console.error('❌ Errors:', diagnostics.errors);
  }
  
  if (diagnostics.warnings.length > 0) {
    console.warn('⚠️ Warnings:', diagnostics.warnings);
  }
  
  console.groupEnd();
}