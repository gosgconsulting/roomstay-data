/**
 * Simple Make.com workflow creation
 * Creates a basic scenario that can be configured in Make.com UI
 */

const MAKE_API_TOKEN = '6b38a4f1-1152-4a23-a805-cf5767b53590';
const MAKE_TEAM_ID = 595770;
const REPORT_ID = '4b41d292-13f7-4695-81f9-0b4ee1761c9f';
const REPORT_NAME = 'Metasearch Results';

// Try both regions
const regions = ['us1', 'eu1'];

async function createSimpleScenario(region) {
  console.log(`\n🔄 Trying region: ${region}...`);

  // Minimal valid blueprint - just a webhook trigger
  // User can add other modules manually in Make.com UI
  const minimalBlueprint = {
    flow: [
      {
        moduleId: 1,
        parameters: {
          hook: 'custom',
          path: `report-analysis-${REPORT_ID.substring(0, 8)}`
        }
      }
    ]
  };

  const requestBody = {
    teamId: MAKE_TEAM_ID,
    name: `Data Studio Report Analysis - ${REPORT_NAME}`,
    blueprint: JSON.stringify(minimalBlueprint),
    scheduling: JSON.stringify({
      type: 'interval',
      interval: 86400
    })
  };

  // Try different token formats
  const tokenFormats = [
    `Token ${MAKE_API_TOKEN}`,
    MAKE_API_TOKEN
  ];

  for (const tokenFormat of tokenFormats) {
    try {
      console.log(`   Trying token format: ${tokenFormat.substring(0, 20)}...`);
      
      const response = await fetch(`https://${region}.make.com/api/v2/scenarios`, {
        method: 'POST',
        headers: {
          'Authorization': tokenFormat,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      console.log(`   Status: ${response.status}`);

      if (response.ok) {
        const scenario = JSON.parse(responseText);
        console.log(`\n✅ SUCCESS! Scenario created!`);
        console.log(`   Scenario ID: ${scenario.id}`);
        console.log(`   Name: ${scenario.name}`);
        console.log(`   URL: https://${region}.make.com/scenario/${scenario.id}/editor`);
        
        console.log(`\n📋 Next Steps:`);
        console.log(`   1. Open: https://${region}.make.com/scenario/${scenario.id}/editor`);
        console.log(`   2. Add HTTP module to get data:`);
        console.log(`      - URL: https://yourdomain.com/api/make/reports/${REPORT_ID}/last-7-days`);
        console.log(`      - Header: x-api-key: your-api-key`);
        console.log(`   3. Add Claude AI module to analyze data`);
        console.log(`   4. Add Slack module to send results`);
        console.log(`   5. Connect the modules in sequence`);
        console.log(`   6. Test and activate`);
        
        return scenario;
      } else if (response.status === 401) {
        console.log(`   ❌ Unauthorized - trying next format...`);
        continue;
      } else {
        console.log(`   ❌ Error: ${responseText.substring(0, 200)}`);
        // Try next format
        continue;
      }
    } catch (error) {
      console.log(`   ❌ Exception: ${error.message}`);
      continue;
    }
  }

  return null;
}

async function main() {
  console.log('🚀 Creating Make.com Workflow');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n📍 Configuration:`);
  console.log(`   Report: ${REPORT_NAME}`);
  console.log(`   Report ID: ${REPORT_ID}`);
  console.log(`   Team ID: ${MAKE_TEAM_ID}`);
  console.log(`   API Token: ${MAKE_API_TOKEN.substring(0, 20)}...`);

  for (const region of regions) {
    const scenario = await createSimpleScenario(region);
    if (scenario) {
      return; // Success!
    }
  }

  console.log(`\n❌ Failed to create scenario in any region`);
  console.log(`\n💡 Alternative: Create manually in Make.com:`);
  console.log(`   1. Go to Make.com`);
  console.log(`   2. Create new scenario`);
  console.log(`   3. Add modules as described in MAKE_WEBHOOK_WORKFLOW.md`);
}

main().catch(console.error);
