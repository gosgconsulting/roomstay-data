/**
 * Script to create Make.com workflow for Data Studio reports
 * 
 * Usage:
 *   node create-make-workflow.js
 * 
 * Or set environment variables:
 *   MAKE_API_TOKEN=your-token MAKE_TEAM_ID=123456 node create-make-workflow.js
 */

const reports = [
  {
    reportId: '4b41d292-13f7-4695-81f9-0b4ee1761c9f',
    reportName: 'Metasearch Results'
  }
  // Add more reports here as needed
];

const API_BASE_URL = process.env.API_BASE_URL || 'https://yourdomain.com';
const MAKE_API_TOKEN = process.env.MAKE_API_TOKEN;
const MAKE_TEAM_ID = process.env.MAKE_TEAM_ID;
const MAKE_REGION = process.env.MAKE_REGION || 'us1';
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || '#data-reports';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

async function createMakeScenario(report) {
  console.log(`\n📊 Creating Make.com scenario for: ${report.reportName}`);
  console.log(`   Report ID: ${report.reportId}`);

  if (!MAKE_API_TOKEN || !MAKE_TEAM_ID) {
    console.error('❌ Error: MAKE_API_TOKEN and MAKE_TEAM_ID are required');
    console.error('   Set them as environment variables or edit this script');
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/make/create-scenario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reportId: report.reportId,
        reportName: report.reportName,
        makeApiToken: MAKE_API_TOKEN,
        teamId: MAKE_TEAM_ID,
        slackChannel: SLACK_CHANNEL,
        slackWebhookUrl: SLACK_WEBHOOK_URL,
        makeRegion: MAKE_REGION
      })
    });

    const result = await response.json();

    if (result.success) {
      console.log(`✅ Scenario created successfully!`);
      console.log(`   Scenario ID: ${result.scenario.id}`);
      console.log(`   Name: ${result.scenario.name}`);
      console.log(`   URL: ${result.scenario.url}`);
      return result.scenario;
    } else {
      console.error(`❌ Failed to create scenario:`);
      console.error(`   Error: ${result.error}`);
      if (result.details) {
        console.error(`   Details: ${result.details}`);
      }
      return null;
    }
  } catch (error) {
    console.error(`❌ Error creating scenario:`, error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Make.com Workflow Creator');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (!MAKE_API_TOKEN) {
    console.log('\n⚠️  MAKE_API_TOKEN not set');
    console.log('   Get it from: Make.com → Profile → API');
    console.log('   Set it: export MAKE_API_TOKEN="your-token"');
  }
  
  if (!MAKE_TEAM_ID) {
    console.log('\n⚠️  MAKE_TEAM_ID not set');
    console.log('   Get it from: Make.com → Team settings');
    console.log('   Set it: export MAKE_TEAM_ID="123456"');
  }

  if (!MAKE_API_TOKEN || !MAKE_TEAM_ID) {
    console.log('\n📝 Edit this script to add your credentials, or set environment variables');
    return;
  }

  console.log(`\n📍 Configuration:`);
  console.log(`   API Base URL: ${API_BASE_URL}`);
  console.log(`   Make Region: ${MAKE_REGION}`);
  console.log(`   Slack Channel: ${SLACK_CHANNEL}`);
  console.log(`   Reports to create: ${reports.length}`);

  const results = [];

  for (const report of reports) {
    const scenario = await createMakeScenario(report);
    if (scenario) {
      results.push({ report, scenario });
    }
    // Wait a bit between requests to avoid rate limiting
    if (reports.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n✨ Summary:`);
  console.log(`   Created: ${results.length} of ${reports.length} scenarios`);
  
  if (results.length > 0) {
    console.log(`\n📋 Next Steps:`);
    console.log(`   1. Open each scenario in Make.com`);
    console.log(`   2. Configure the API key in the HTTP module`);
    console.log(`   3. Connect Claude AI account`);
    console.log(`   4. Connect Slack account`);
    console.log(`   5. Test with "Run once"`);
    console.log(`   6. Activate the scenario`);
    
    console.log(`\n🔗 Scenario URLs:`);
    results.forEach(({ report, scenario }) => {
      console.log(`   ${report.reportName}: ${scenario.url}`);
    });
  }
}

// Run if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  main().catch(console.error);
}

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createMakeScenario, main };
}
