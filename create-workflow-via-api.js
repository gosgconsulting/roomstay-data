/**
 * Create Make.com workflow via our API endpoint
 * This uses our server which handles Make.com API calls
 */

const REPORT_ID = '4b41d292-13f7-4695-81f9-0b4ee1761c9f';
const REPORT_NAME = 'Metasearch Results';
const MAKE_API_TOKEN = '6b38a4f1-1152-4a23-a805-cf5767b53590';
const API_BASE_URL = process.env.API_BASE_URL || 'https://yourdomain.com';
const MAKE_TEAM_ID = process.env.MAKE_TEAM_ID || '595770';
const MAKE_REGION = process.env.MAKE_REGION || 'us1';
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || '#data-reports';

async function createScenario() {
  console.log('🚀 Creating Make.com Workflow via API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n📍 Configuration:`);
  console.log(`   Report: ${REPORT_NAME}`);
  console.log(`   Report ID: ${REPORT_ID}`);
  console.log(`   API Base URL: ${API_BASE_URL}`);
  console.log(`   Make Region: ${MAKE_REGION}`);
  console.log(`   Slack Channel: ${SLACK_CHANNEL}`);

  if (!MAKE_TEAM_ID) {
    console.log('\n⚠️  MAKE_TEAM_ID is required');
    console.log('   Get it from: Make.com → Team → Settings');
    console.log('   Set it: export MAKE_TEAM_ID="123456"');
    console.log('\n   Or provide it when running:');
    console.log('   MAKE_TEAM_ID="123456" node create-workflow-via-api.js');
    return;
  }

  console.log(`\n📊 Creating scenario...`);

  try {
    const response = await fetch(`${API_BASE_URL}/api/make/create-scenario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reportId: REPORT_ID,
        reportName: REPORT_NAME,
        makeApiToken: MAKE_API_TOKEN,
        teamId: MAKE_TEAM_ID,
        slackChannel: SLACK_CHANNEL,
        makeRegion: MAKE_REGION
      })
    });

    const result = await response.json();

    if (result.success) {
      console.log(`\n✅ Scenario created successfully!`);
      console.log(`   Scenario ID: ${result.scenario.id}`);
      console.log(`   Name: ${result.scenario.name}`);
      console.log(`   URL: ${result.scenario.url}`);
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`\n📋 Next Steps:`);
      console.log(`   1. Open: ${result.scenario.url}`);
      console.log(`   2. Configure API key in HTTP module:`);
      console.log(`      - Click "Get Last 7 Days Data" module`);
      console.log(`      - In x-api-key header, replace {{apiKey}} with your report API key`);
      console.log(`   3. Connect Claude AI account`);
      console.log(`   4. Connect Slack account`);
      console.log(`   5. Test with "Run once"`);
      console.log(`   6. Activate the scenario`);
    } else {
      console.error(`\n❌ Failed to create scenario`);
      console.error(`   Error: ${result.error}`);
      if (result.details) {
        console.error(`   Details: ${result.details}`);
      }
    }
  } catch (error) {
    console.error(`\n❌ Error:`, error.message);
  }
}

createScenario();
