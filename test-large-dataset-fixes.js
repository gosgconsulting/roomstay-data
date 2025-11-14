/**
 * Comprehensive Test Suite for Large Dataset Fixes
 * Tests all optimizations for handling 200k+ rows and Metasearch resync
 */

console.log('🚀 Starting Large Dataset Optimization Tests...');

// Test 1: Check Metasearch Status
async function testMetasearchStatus() {
  console.log('\n📊 Test 1: Metasearch Status Check');
  console.log('=====================================');
  
  try {
    if (typeof window.checkMetasearchStatus === 'function') {
      const status = await window.checkMetasearchStatus();
      
      if (status.exists) {
        console.log('✅ Metasearch data source found');
        console.log(`   - Name: ${status.dataSourceInfo?.name}`);
        console.log(`   - Report: ${status.reportInfo?.name}`);
        console.log(`   - Data count: ${status.dataCount?.toLocaleString()} rows`);
        console.log(`   - Last sync: ${status.lastSync || 'Never'}`);
        
        return { success: true, status };
      } else {
        console.log('❌ Metasearch data source not found');
        return { success: false, error: 'Not found' };
      }
    } else {
      console.log('⚠️ checkMetasearchStatus function not available');
      return { success: false, error: 'Function not available' };
    }
  } catch (error) {
    console.error('❌ Error checking Metasearch status:', error);
    return { success: false, error: error.message };
  }
}

// Test 2: Test Google Sheets Connectivity
async function testGoogleSheetsConnectivity() {
  console.log('\n🔗 Test 2: Google Sheets Connectivity');
  console.log('=====================================');
  
  try {
    if (typeof window.testMetasearchConnectivity === 'function') {
      const result = await window.testMetasearchConnectivity();
      
      if (result.success) {
        console.log('✅ Google Sheets connectivity successful');
        console.log(`   - Rows available: ${result.details?.rowCount?.toLocaleString()}`);
        console.log(`   - Headers: ${result.details?.headerCount}`);
        console.log(`   - Sample headers: ${result.details?.sampleHeaders?.join(', ')}`);
        
        return { success: true, result };
      } else {
        console.log('❌ Google Sheets connectivity failed');
        console.log(`   - Error: ${result.message}`);
        return { success: false, error: result.message };
      }
    } else {
      console.log('⚠️ testMetasearchConnectivity function not available');
      return { success: false, error: 'Function not available' };
    }
  } catch (error) {
    console.error('❌ Error testing connectivity:', error);
    return { success: false, error: error.message };
  }
}

// Test 3: Dataset Size Analysis
async function testDatasetSizeAnalysis() {
  console.log('\n📏 Test 3: Dataset Size Analysis');
  console.log('=================================');
  
  try {
    // Get current report ID from URL or use a known large dataset
    const urlParams = new URLSearchParams(window.location.search);
    const reportId = urlParams.get('reportId') || 'your-report-id-here';
    
    if (typeof window.getDatasetSize === 'function') {
      const sizeInfo = await window.getDatasetSize(reportId);
      
      console.log('📊 Dataset Analysis Results:');
      console.log(`   - Total rows: ${sizeInfo.totalRows.toLocaleString()}`);
      console.log(`   - Estimated size: ${sizeInfo.estimatedSizeGB} GB`);
      console.log(`   - Recommended chunk size: ${sizeInfo.recommendedChunkSize.toLocaleString()}`);
      console.log(`   - Estimated fetch time: ${sizeInfo.estimatedFetchTime} seconds`);
      
      // Determine if this is a large dataset
      const isLargeDataset = sizeInfo.totalRows > 100000;
      console.log(`   - Classification: ${isLargeDataset ? '🔥 LARGE DATASET' : '📊 Standard dataset'}`);
      
      return { success: true, sizeInfo, isLargeDataset };
    } else {
      console.log('⚠️ getDatasetSize function not available');
      return { success: false, error: 'Function not available' };
    }
  } catch (error) {
    console.error('❌ Error analyzing dataset size:', error);
    return { success: false, error: error.message };
  }
}

// Test 4: Performance Test
async function testDataFetchPerformance() {
  console.log('\n⚡ Test 4: Data Fetch Performance Test');
  console.log('======================================');
  
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const reportId = urlParams.get('reportId') || 'your-report-id-here';
    
    if (typeof window.testDataFetchPerformance === 'function') {
      console.log('🔄 Running performance test (10,000 rows sample)...');
      
      const perfResult = await window.testDataFetchPerformance(reportId, 10000);
      
      if (perfResult.success) {
        console.log('✅ Performance test completed');
        console.log(`   - Speed: ${perfResult.rowsPerSecond.toLocaleString()} rows/second`);
        console.log(`   - Avg response time: ${perfResult.avgResponseTime}ms per chunk`);
        console.log(`   - Recommended chunk size: ${perfResult.recommendedSettings.chunkSize.toLocaleString()}`);
        console.log(`   - Max concurrent: ${perfResult.recommendedSettings.maxConcurrent}`);
        
        // Performance classification
        if (perfResult.rowsPerSecond > 5000) {
          console.log('   - Performance: 🚀 EXCELLENT');
        } else if (perfResult.rowsPerSecond > 2000) {
          console.log('   - Performance: ✅ GOOD');
        } else if (perfResult.rowsPerSecond > 1000) {
          console.log('   - Performance: ⚠️ MODERATE');
        } else {
          console.log('   - Performance: 🐌 SLOW');
        }
        
        return { success: true, perfResult };
      } else {
        console.log('❌ Performance test failed');
        return { success: false, error: 'Performance test failed' };
      }
    } else {
      console.log('⚠️ testDataFetchPerformance function not available');
      return { success: false, error: 'Function not available' };
    }
  } catch (error) {
    console.error('❌ Error in performance test:', error);
    return { success: false, error: error.message };
  }
}

// Test 5: Large Dataset Fetch Test
async function testLargeDatasetFetch() {
  console.log('\n🗂️ Test 5: Large Dataset Fetch Test');
  console.log('====================================');
  
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const reportId = urlParams.get('reportId') || 'your-report-id-here';
    
    if (typeof window.fetchLargeDataset === 'function') {
      console.log('🔄 Testing optimized large dataset fetching (25,000 rows sample)...');
      
      const fetchResult = await window.fetchLargeDataset({
        reportId: reportId,
        chunkSize: 5000,
        maxRows: 25000,
        orderBy: 'desc',
        onProgress: (loaded, total) => {
          const progress = total ? Math.round((loaded / total) * 100) : 0;
          console.log(`   📊 Progress: ${loaded.toLocaleString()} rows loaded ${total ? `(${progress}%)` : ''}`);
        }
      });
      
      if (fetchResult.success) {
        console.log('✅ Large dataset fetch completed');
        console.log(`   - Rows fetched: ${fetchResult.totalRows.toLocaleString()}`);
        console.log(`   - Chunks processed: ${fetchResult.chunksProcessed}`);
        console.log(`   - Time elapsed: ${fetchResult.timeElapsed.toFixed(2)}s`);
        console.log(`   - Average speed: ${Math.round(fetchResult.totalRows / fetchResult.timeElapsed).toLocaleString()} rows/sec`);
        
        return { success: true, fetchResult };
      } else {
        console.log('❌ Large dataset fetch failed');
        console.log(`   - Error: ${fetchResult.error}`);
        console.log(`   - Partial data: ${fetchResult.totalRows.toLocaleString()} rows`);
        return { success: false, error: fetchResult.error, partialData: fetchResult.totalRows };
      }
    } else {
      console.log('⚠️ fetchLargeDataset function not available');
      return { success: false, error: 'Function not available' };
    }
  } catch (error) {
    console.error('❌ Error in large dataset fetch test:', error);
    return { success: false, error: error.message };
  }
}

// Test 6: Metasearch Fix Test
async function testMetasearchFix() {
  console.log('\n🔧 Test 6: Metasearch Fix Test');
  console.log('===============================');
  
  try {
    if (typeof window.fixMetasearchDataSource === 'function') {
      console.log('🔄 Running Metasearch resync fix...');
      console.log('⚠️ This will perform a full resync and may take several minutes for large datasets');
      
      // Ask for confirmation
      const confirmed = confirm('Do you want to proceed with the Metasearch resync fix? This will delete existing data and re-import from Google Sheets.');
      
      if (!confirmed) {
        console.log('⏹️ Metasearch fix cancelled by user');
        return { success: false, error: 'Cancelled by user' };
      }
      
      const fixResult = await window.fixMetasearchDataSource();
      
      if (fixResult.success) {
        console.log('✅ Metasearch fix completed successfully');
        console.log(`   - Data source: ${fixResult.details?.dataSourceName}`);
        console.log(`   - Report: ${fixResult.details?.reportName}`);
        console.log(`   - Rows processed: ${fixResult.rowsProcessed?.toLocaleString()}`);
        console.log(`   - Dimensions created: ${fixResult.details?.dimensionsCreated}`);
        
        return { success: true, fixResult };
      } else {
        console.log('❌ Metasearch fix failed');
        console.log(`   - Error: ${fixResult.message}`);
        console.log(`   - Details: ${fixResult.error}`);
        return { success: false, error: fixResult.message };
      }
    } else {
      console.log('⚠️ fixMetasearchDataSource function not available');
      return { success: false, error: 'Function not available' };
    }
  } catch (error) {
    console.error('❌ Error in Metasearch fix test:', error);
    return { success: false, error: error.message };
  }
}

// Main Test Runner
async function runAllTests() {
  console.log('🧪 Large Dataset Optimization Test Suite');
  console.log('=========================================');
  console.log('This test suite validates all optimizations for handling 200k+ rows');
  console.log('');
  
  const results = {
    metasearchStatus: null,
    connectivity: null,
    datasetSize: null,
    performance: null,
    largeFetch: null,
    metasearchFix: null
  };
  
  // Run tests sequentially
  results.metasearchStatus = await testMetasearchStatus();
  results.connectivity = await testGoogleSheetsConnectivity();
  results.datasetSize = await testDatasetSizeAnalysis();
  results.performance = await testDataFetchPerformance();
  results.largeFetch = await testLargeDatasetFetch();
  
  // Only run Metasearch fix if other tests pass
  if (results.metasearchStatus.success && results.connectivity.success) {
    results.metasearchFix = await testMetasearchFix();
  } else {
    console.log('\n⏭️ Skipping Metasearch fix test due to prerequisite failures');
  }
  
  // Summary
  console.log('\n📋 Test Summary');
  console.log('===============');
  
  const tests = [
    { name: 'Metasearch Status', result: results.metasearchStatus },
    { name: 'Google Sheets Connectivity', result: results.connectivity },
    { name: 'Dataset Size Analysis', result: results.datasetSize },
    { name: 'Performance Test', result: results.performance },
    { name: 'Large Dataset Fetch', result: results.largeFetch },
    { name: 'Metasearch Fix', result: results.metasearchFix }
  ];
  
  let passedTests = 0;
  let totalTests = 0;
  
  tests.forEach(test => {
    if (test.result !== null) {
      totalTests++;
      const status = test.result.success ? '✅' : '❌';
      console.log(`${status} ${test.name}`);
      if (test.result.success) passedTests++;
    }
  });
  
  console.log(`\n🎯 Overall Result: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! Large dataset optimizations are working correctly.');
  } else {
    console.log('⚠️ Some tests failed. Check the details above for troubleshooting.');
  }
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  if (results.datasetSize?.success && results.datasetSize.isLargeDataset) {
    console.log('- ✅ Large dataset detected - optimizations are essential');
    console.log('- 🔧 Use adaptive batch sizing for sync operations');
    console.log('- ⏱️ Expect longer processing times for full syncs');
    console.log('- 📊 Consider incremental sync for regular updates');
  }
  
  if (results.performance?.success) {
    const speed = results.performance.perfResult.rowsPerSecond;
    if (speed < 2000) {
      console.log('- ⚠️ Performance is below optimal - consider smaller chunk sizes');
    } else {
      console.log('- ✅ Performance is good for large dataset operations');
    }
  }
  
  return results;
}

// Auto-run tests when script is loaded
runAllTests().catch(error => {
  console.error('💥 Test suite error:', error);
});

// Make test functions available globally
window.testLargeDatasetOptimizations = runAllTests;
window.testMetasearchStatus = testMetasearchStatus;
window.testGoogleSheetsConnectivity = testGoogleSheetsConnectivity;
window.testDatasetSizeAnalysis = testDatasetSizeAnalysis;
window.testDataFetchPerformance = testDataFetchPerformance;
window.testLargeDatasetFetch = testLargeDatasetFetch;
window.testMetasearchFix = testMetasearchFix;
