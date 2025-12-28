/**
 * Direct Make.com API call to create workflow
 * Uses Make.com API token: 6b38a4f1-1152-4a23-a805-cf5767b53590
 */

const MAKE_API_TOKEN = '6b38a4f1-1152-4a23-a805-cf5767b53590';
const MAKE_TEAM_ID = '595770';
const REPORT_ID = '4b41d292-13f7-4695-81f9-0b4ee1761c9f';
const REPORT_NAME = 'Metasearch Results';
const API_BASE_URL = process.env.API_BASE_URL || 'https://yourdomain.com';
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || '#data-reports';

// Try to detect region from token or use default
const MAKE_REGION = process.env.MAKE_REGION || 'us1';

async function getTeamId(region = MAKE_REGION) {
  console.log(`🔍 Getting Team ID from ${region}...`);
  
  // Try different token formats
  const tokenFormats = [
    MAKE_API_TOKEN,
    `Token ${MAKE_API_TOKEN}`,
    `Bearer ${MAKE_API_TOKEN}`
  ];

  for (const tokenFormat of tokenFormats) {
    try {
      const response = await fetch(`https://${region}.make.com/api/v2/teams`, {
        headers: {
          'Authorization': tokenFormat,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const teams = await response.json();
        
        if (teams.teams && teams.teams.length > 0) {
          console.log(`✅ Found team: ${teams.teams[0].name} (ID: ${teams.teams[0].id})`);
          return { teamId: teams.teams[0].id, region };
        }
      } else if (response.status === 401) {
        // Try next token format
        continue;
      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      // Try next format
      continue;
    }
  }
  
  return null;
}

async function detectRegionAndTeam() {
  console.log('🔍 Detecting Make.com region and team...');
  
  const regions = ['us1', 'eu1'];
  
  for (const region of regions) {
    console.log(`   Trying ${region}...`);
    const result = await getTeamId(region);
    if (result) {
      return result;
    }
  }
  
  return null;
}

function generateBlueprint() {
  // Make.com blueprint format (without version and with proper structure)
  return {
    name: `Data Studio Report Analysis - ${REPORT_NAME}`,
    flow: [
      {
        id: 1,
        type: 'webhooks',
        name: 'Custom webhook',
        position: [250, 300],
        parameters: {
          hook: 'custom',
          path: `report-analysis-${REPORT_ID.substring(0, 8)}`
        },
        metadata: {
          label: 'Webhook Trigger'
        }
      },
      {
        id: 2,
        type: 'http',
        name: 'Get Last 7 Days Data',
        position: [450, 300],
        parameters: {
          method: 'GET',
          url: `${API_BASE_URL}/api/make/reports/${REPORT_ID}/last-7-days`,
          headers: [
            {
              key: 'x-api-key',
              value: '{{apiKey}}'
            }
          ]
        },
        metadata: {
          label: 'Fetch Report Data'
        },
        connections: {
          outgoing: [
            {
              moduleId: 3
            }
          ]
        }
      },
      {
        id: 3,
        type: 'anthropic',
        name: 'Claude AI Analysis',
        position: [650, 300],
        parameters: {
          model: 'claude-3-5-sonnet-20241022',
          system: 'You are a data analyst specializing in marketing performance data. Analyze the provided data and create a concise, actionable summary focusing on key insights, trends, and recommendations.',
          messages: [
            {
              role: 'user',
              content: `Analyze the following marketing performance data from the last 7 days:

Report: ${REPORT_NAME}
Date Range: {{2.dateRange.from}} to {{2.dateRange.to}}
Total Records: {{2.count}}

Data:
{{2.data}}

Please provide:
1. Key performance metrics summary
2. Notable trends or changes
3. Top performing channels/campaigns
4. Areas of concern or opportunities
5. Actionable recommendations

Format the response in a clear, structured way suitable for a Slack message.`
            }
          ]
        },
        metadata: {
          label: 'AI Analysis'
        },
        connections: {
          outgoing: [
            {
              moduleId: 4
            }
          ]
        }
      },
      {
        id: 4,
        type: 'slack',
        name: 'Send to Slack',
        position: [850, 300],
        parameters: {
          channel: SLACK_CHANNEL,
          text: `📊 *Data Studio Report Analysis - Last 7 Days*\n\n*Report:* ${REPORT_NAME}\n*Date Range:* {{2.dateRange.from}} to {{2.dateRange.to}}\n*Records Analyzed:* {{2.count}}\n\n---\n\n{{3.content[0].text}}\n\n---\n\n*Generated:* {{now}}`
        },
        metadata: {
          label: 'Slack Notification'
        }
      }
    ]
  };
}

async function createScenario(teamId, region = MAKE_REGION) {
  console.log(`\n📊 Creating Make.com scenario for: ${REPORT_NAME}`);
  console.log(`   Report ID: ${REPORT_ID}`);
  console.log(`   Team ID: ${teamId}`);
  console.log(`   Region: ${region}`);

  const blueprint = generateBlueprint();

  // Try different token formats
  const tokenFormats = [
    `Token ${MAKE_API_TOKEN}`,
    MAKE_API_TOKEN,
    `Bearer ${MAKE_API_TOKEN}`
  ];

  for (const tokenFormat of tokenFormats) {
    try {
      const response = await fetch(`https://${region}.make.com/api/v2/scenarios`, {
        method: 'POST',
        headers: {
          'Authorization': tokenFormat,
          'Content-Type': 'application/json'
        },
      // Make.com API expects blueprint as JSON object, not string
      // And scheduling as an object with type
      const requestBody = {
        teamId: parseInt(teamId),
        name: `Data Studio Report Analysis - ${REPORT_NAME}`,
        blueprint: blueprint, // Send as object, not stringified
        scheduling: {
          type: 'interval',
          interval: 86400 // Daily in seconds
        }
      };

      const response = await fetch(`https://${region}.make.com/api/v2/scenarios`, {
        method: 'POST',
        headers: {
          'Authorization': tokenFormat,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      console.log(`\n📡 Response Status: ${response.status}`);
      
      if (response.ok) {
        let scenarioData;
        try {
          scenarioData = JSON.parse(responseText);
        } catch (e) {
          console.error('❌ Failed to parse response:', e);
          console.log('Raw response:', responseText);
          return null;
        }

        console.log(`\n✅ Scenario created successfully!`);
        console.log(`   Scenario ID: ${scenarioData.id}`);
        console.log(`   Name: ${scenarioData.name || 'Data Studio Report Analysis'}`);
        console.log(`   URL: https://${region}.make.com/scenario/${scenarioData.id}/editor`);
        
        return scenarioData;
      } else if (response.status === 401) {
        // Try next token format
        continue;
      } else {
        console.error(`❌ Error Response: ${responseText}`);
        return null;
      }
    } catch (error) {
      // Try next format
      continue;
    }
  }
  
  console.error(`❌ Failed to create scenario with any token format`);
  return null;
}

async function main() {
  console.log('🚀 Creating Make.com Workflow via Direct API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n📍 Configuration:`);
  console.log(`   Report: ${REPORT_NAME}`);
  console.log(`   Report ID: ${REPORT_ID}`);
  console.log(`   API Base URL: ${API_BASE_URL}`);
  console.log(`   Make Region: ${MAKE_REGION}`);
  console.log(`   Team ID: ${MAKE_TEAM_ID}`);
  console.log(`   Slack Channel: ${SLACK_CHANNEL}`);

  // Try both regions
  const regions = ['us1', 'eu1'];
  let success = false;

  for (const region of regions) {
    console.log(`\n🔄 Trying region: ${region}...`);
    const scenario = await createScenario(MAKE_TEAM_ID, region);
    
    if (scenario) {
      success = true;
      break;
    }
  }

  if (!success) {
    console.log('\n❌ Failed to create scenario in any region');
    console.log('   Check the error messages above');
    console.log('\n💡 Troubleshooting:');
    console.log('   - Verify API token is correct');
    console.log('   - Check token has "scenarios:write" permission');
    console.log('   - Verify Team ID is correct: 595770');
  }

  if (scenario) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n✨ Success!`);
    console.log(`\n📋 Next Steps:`);
    console.log(`   1. Open: https://${teamInfo.region}.make.com/scenario/${scenario.id}/editor`);
    console.log(`   2. Configure API key in HTTP module (x-api-key header)`);
    console.log(`   3. Connect Claude AI account`);
    console.log(`   4. Connect Slack account`);
    console.log(`   5. Test with "Run once"`);
    console.log(`   6. Activate the scenario`);
  } else {
    console.log('\n❌ Failed to create scenario');
    console.log('   Check the error messages above');
    console.log('\n💡 Troubleshooting:');
    console.log('   - Verify API token is correct');
    console.log('   - Check token has "scenarios:write" permission');
    console.log('   - Try different region: export MAKE_REGION="eu1"');
  }
}

main().catch(console.error);
