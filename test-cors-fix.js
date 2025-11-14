/**
 * Quick CORS Fix Test
 * Tests the fetch-google-sheets function to verify the Next button will work
 */

console.log('🔧 Testing CORS Fix for Next Button...');

async function testCORSFix() {
  try {
    console.log('📡 Testing fetch-google-sheets function...');
    
    // Test with the same spreadsheet ID from the screenshot
    const spreadsheetId = '1bRFKEEBWcnX4yRZ8lJuIJ2p8m_c70VojVJe6QEEYmI4';
    
    const { data, error } = await supabase.functions.invoke('fetch-google-sheets', {
      body: {
        spreadsheetId: spreadsheetId,
        action: 'metadata'
      }
    });

    if (error) {
      console.error('❌ CORS fix failed:', error);
      console.log('   - Error details:', error);
      return false;
    }

    if (data && data.sheets) {
      console.log('✅ CORS fix successful!');
      console.log(`   - Found ${data.sheets.length} sheets`);
      console.log(`   - Available tabs: ${data.sheets.map(s => s.title).join(', ')}`);
      console.log('   - Next button should now work properly');
      return true;
    } else {
      console.log('⚠️ Function responded but no sheets data found');
      return false;
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return false;
  }
}

// Run the test
testCORSFix().then(success => {
  if (success) {
    console.log('\n🎉 CORS Fix Verified!');
    console.log('✅ The Next button in the Edit Data Source modal should now work');
    console.log('✅ You can proceed with configuring your data source');
  } else {
    console.log('\n❌ CORS Fix Failed');
    console.log('⚠️ The Next button may still not work');
    console.log('💡 Try refreshing the page and testing again');
  }
});

// Make test available globally
window.testCORSFix = testCORSFix;
