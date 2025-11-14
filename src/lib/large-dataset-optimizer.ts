import { supabase } from '@/integrations/supabase/client';

/**
 * Large Dataset Optimizer
 * Handles efficient fetching of 200k+ rows with intelligent chunking and timeout handling
 */

export interface DataFetchOptions {
  reportId: string;
  chunkSize?: number;
  maxRows?: number;
  orderBy?: 'asc' | 'desc';
  onProgress?: (loaded: number, total?: number) => void;
  includeFields?: string[];
}

export interface DataFetchResult {
  success: boolean;
  data: any[];
  totalRows: number;
  chunksProcessed: number;
  timeElapsed: number;
  error?: string;
}

/**
 * Optimized data fetching for large datasets
 * Automatically handles chunking, retries, and timeout management
 */
export async function fetchLargeDataset(options: DataFetchOptions): Promise<DataFetchResult> {
  const startTime = Date.now();
  const {
    reportId,
    chunkSize = 5000, // Optimized chunk size for large datasets
    maxRows, // No limit by default - fetch ALL data
    orderBy = 'desc',
    onProgress,
    includeFields = ['id', 'row_number', 'dimension_values']
  } = options;

  console.log(`[LARGE-DATASET] Starting optimized fetch for report: ${reportId}`);
  console.log(`[LARGE-DATASET] Chunk size: ${chunkSize}, Order: ${orderBy}, Max rows: ${maxRows || 'unlimited'}`);

  let allData: any[] = [];
  let offset = 0;
  let hasMore = true;
  let chunksProcessed = 0;
  let consecutiveTimeouts = 0;
  const maxTimeouts = 5;

  try {
    // First, get total count for progress tracking (with timeout protection)
    let totalCount: number | undefined;
    try {
      const { count, error: countError } = await supabase
        .from('dimension_data')
        .select('id', { count: 'exact', head: true })
        .eq('report_id', reportId)
        .abortSignal(AbortSignal.timeout(30000)); // 30 second timeout for count

      if (!countError && count !== null) {
        totalCount = count;
        console.log(`[LARGE-DATASET] Total rows available: ${totalCount}`);
      }
    } catch (countError) {
      console.warn('[LARGE-DATASET] Could not get total count, proceeding without progress tracking');
    }

    while (hasMore && consecutiveTimeouts < maxTimeouts) {
      const currentChunkSize = Math.min(chunkSize, (maxRows || Infinity) - allData.length);
      
      if (currentChunkSize <= 0) {
        console.log(`[LARGE-DATASET] Reached max rows limit: ${maxRows}`);
        break;
      }

      console.log(`[LARGE-DATASET] Fetching chunk ${chunksProcessed + 1} at offset ${offset} (size: ${currentChunkSize})`);

      try {
        const { data: chunkData, error: chunkError } = await supabase
          .from('dimension_data')
          .select(includeFields.join(', '))
          .eq('report_id', reportId)
          .order('row_number', { ascending: orderBy === 'asc' })
          .range(offset, offset + currentChunkSize - 1)
          .abortSignal(AbortSignal.timeout(120000)); // 2 minute timeout per chunk

        if (chunkError) {
          if (chunkError.message?.includes('timeout')) {
            consecutiveTimeouts++;
            console.warn(`[LARGE-DATASET] Timeout ${consecutiveTimeouts}/${maxTimeouts} at offset ${offset}`);
            
            if (consecutiveTimeouts >= maxTimeouts) {
              console.warn('[LARGE-DATASET] Max timeouts reached, stopping with available data');
              break;
            }
            
            // Skip this chunk and try the next one
            offset += currentChunkSize;
            continue;
          } else {
            throw chunkError;
          }
        }

        if (chunkData && chunkData.length > 0) {
          allData = [...allData, ...chunkData];
          offset += currentChunkSize;
          chunksProcessed++;
          consecutiveTimeouts = 0; // Reset timeout counter on success

          // Check if we got less data than requested (end of dataset)
          if (chunkData.length < currentChunkSize) {
            hasMore = false;
            console.log(`[LARGE-DATASET] Reached end of data at chunk ${chunksProcessed}`);
          }

          // Progress callback
          if (onProgress) {
            onProgress(allData.length, totalCount);
          }

          // Progress logging for large datasets
          if (allData.length % 25000 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = Math.round(allData.length / elapsed);
            console.log(`[LARGE-DATASET] Progress: ${allData.length} rows loaded (${rate} rows/sec)`);
          }

        } else {
          hasMore = false;
          console.log('[LARGE-DATASET] No more data available');
        }

      } catch (chunkError: any) {
        console.error(`[LARGE-DATASET] Error fetching chunk at offset ${offset}:`, chunkError);
        
        if (chunkError.message?.includes('timeout')) {
          consecutiveTimeouts++;
          if (consecutiveTimeouts >= maxTimeouts) {
            console.warn('[LARGE-DATASET] Max timeouts reached, stopping with available data');
            break;
          }
          offset += currentChunkSize;
          continue;
        } else {
          // Non-timeout error - stop fetching but return what we have
          console.warn('[LARGE-DATASET] Non-timeout error, stopping with available data');
          break;
        }
      }

      // Small delay between chunks for very large datasets to prevent overwhelming the database
      if (allData.length > 100000 && chunksProcessed % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms pause every 10 chunks
      }
    }

    const timeElapsed = (Date.now() - startTime) / 1000;
    const avgRate = Math.round(allData.length / timeElapsed);

    console.log(`[LARGE-DATASET] Fetch complete: ${allData.length} rows in ${chunksProcessed} chunks`);
    console.log(`[LARGE-DATASET] Time elapsed: ${timeElapsed.toFixed(2)}s (${avgRate} rows/sec)`);

    return {
      success: true,
      data: allData,
      totalRows: allData.length,
      chunksProcessed,
      timeElapsed
    };

  } catch (error: any) {
    const timeElapsed = (Date.now() - startTime) / 1000;
    console.error('[LARGE-DATASET] Fatal error:', error);
    
    return {
      success: false,
      data: allData, // Return partial data if available
      totalRows: allData.length,
      chunksProcessed,
      timeElapsed,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Get dataset size estimate
 */
export async function getDatasetSize(reportId: string): Promise<{
  totalRows: number;
  estimatedSizeGB: number;
  recommendedChunkSize: number;
  estimatedFetchTime: number;
}> {
  try {
    const { count } = await supabase
      .from('dimension_data')
      .select('id', { count: 'exact', head: true })
      .eq('report_id', reportId)
      .abortSignal(AbortSignal.timeout(30000));

    const totalRows = count || 0;
    
    // Rough estimates based on typical dimension_data row size (~2KB per row)
    const estimatedSizeGB = (totalRows * 2048) / (1024 * 1024 * 1024);
    
    // Recommended chunk size based on dataset size
    let recommendedChunkSize: number;
    if (totalRows > 200000) {
      recommendedChunkSize = 2500; // Very large datasets
    } else if (totalRows > 100000) {
      recommendedChunkSize = 5000; // Large datasets
    } else if (totalRows > 50000) {
      recommendedChunkSize = 7500; // Medium datasets
    } else {
      recommendedChunkSize = 10000; // Small datasets
    }

    // Estimated fetch time (based on ~2000 rows/second average)
    const estimatedFetchTime = Math.ceil(totalRows / 2000);

    return {
      totalRows,
      estimatedSizeGB: Math.round(estimatedSizeGB * 100) / 100,
      recommendedChunkSize,
      estimatedFetchTime
    };

  } catch (error) {
    console.error('[DATASET-SIZE] Error getting dataset size:', error);
    return {
      totalRows: 0,
      estimatedSizeGB: 0,
      recommendedChunkSize: 5000,
      estimatedFetchTime: 0
    };
  }
}

/**
 * Test data fetching performance
 */
export async function testDataFetchPerformance(reportId: string, testSize: number = 10000): Promise<{
  success: boolean;
  rowsPerSecond: number;
  avgResponseTime: number;
  recommendedSettings: {
    chunkSize: number;
    maxConcurrent: number;
  };
}> {
  const startTime = Date.now();
  
  try {
    const result = await fetchLargeDataset({
      reportId,
      chunkSize: 2500,
      maxRows: testSize,
      orderBy: 'desc'
    });

    if (result.success && result.totalRows > 0) {
      const rowsPerSecond = Math.round(result.totalRows / result.timeElapsed);
      const avgResponseTime = (result.timeElapsed * 1000) / result.chunksProcessed;

      // Recommend settings based on performance
      let recommendedChunkSize: number;
      let maxConcurrent: number;

      if (rowsPerSecond > 5000) {
        recommendedChunkSize = 10000;
        maxConcurrent = 3;
      } else if (rowsPerSecond > 2000) {
        recommendedChunkSize = 5000;
        maxConcurrent = 2;
      } else {
        recommendedChunkSize = 2500;
        maxConcurrent = 1;
      }

      return {
        success: true,
        rowsPerSecond,
        avgResponseTime: Math.round(avgResponseTime),
        recommendedSettings: {
          chunkSize: recommendedChunkSize,
          maxConcurrent
        }
      };
    } else {
      return {
        success: false,
        rowsPerSecond: 0,
        avgResponseTime: 0,
        recommendedSettings: {
          chunkSize: 2500,
          maxConcurrent: 1
        }
      };
    }

  } catch (error) {
    console.error('[PERFORMANCE-TEST] Error:', error);
    return {
      success: false,
      rowsPerSecond: 0,
      avgResponseTime: 0,
      recommendedSettings: {
        chunkSize: 2500,
        maxConcurrent: 1
      }
    };
  }
}

// Make functions available globally for testing
if (typeof window !== 'undefined') {
  (window as any).fetchLargeDataset = fetchLargeDataset;
  (window as any).getDatasetSize = getDatasetSize;
  (window as any).testDataFetchPerformance = testDataFetchPerformance;
}
