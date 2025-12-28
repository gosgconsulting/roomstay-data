/**
 * Script to create a new Make.com scenario
 * This will be executed to create the scenario with proper structure
 */

console.log('Creating new Make.com scenario...');
console.log('Team ID: 595770');
console.log('Report ID: 4b41d292-13f7-4695-81f9-0b4ee1761c9f');
console.log('Report Name: Metasearch Results');

// The blueprint structure for the new scenario
const blueprint = {
  flow: [
    {
      id: 1,
      mapper: {
        hook: 'custom',
        path: 'report-analysis-4b41d292'
      },
      module: 'webhooks:CustomWebhook',
      version: 1,
      metadata: {
        designer: {
          x: -600,
          y: 0
        }
      },
      parameters: {}
    },
    {
      id: 2,
      mapper: {
        url: 'https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f/last-7-days',
        method: 'get',
        headers: [
          {
            name: 'x-api-key',
            value: '{{apiKey}}'
          }
        ],
        shareCookies: false,
        parseResponse: true,
        allowRedirects: true,
        stopOnHttpError: true,
        requestCompressedContent: true
      },
      module: 'http:MakeRequest',
      version: 4,
      metadata: {
        designer: {
          x: -373,
          y: -20
        }
      },
      parameters: {
        tlsType: '',
        proxyKeychain: '',
        authenticationType: 'noAuth'
      }
    },
    {
      id: 3,
      mapper: {
        model: 'claude-3-5-sonnet-20241022',
        system: 'You are a data analyst specializing in marketing performance data. Analyze the provided data and create a concise, actionable summary focusing on key insights, trends, and recommendations.',
        messages: [
          {
            role: 'user',
            content: 'Analyze the following marketing performance data from the last 7 days:\n\nReport: Metasearch Results\nDate Range: {{2.dateRange.from}} to {{2.dateRange.to}}\nTotal Records: {{2.count}}\n\nData:\n{{2.data}}\n\nPlease provide:\n1. Key performance metrics summary\n2. Notable trends or changes\n3. Top performing channels/campaigns\n4. Areas of concern or opportunities\n5. Actionable recommendations\n\nFormat the response in a clear, structured way suitable for a Slack message.'
          }
        ]
      },
      module: 'anthropic-claude:CreateAMessage',
      version: 1,
      metadata: {
        designer: {
          x: 227,
          y: -149
        }
      },
      parameters: {
        __IMTCONN__: 4200938
      }
    },
    {
      id: 4,
      mapper: {
        text: '📊 *Data Studio Report Analysis - Last 7 Days*\n\n*Report:* Metasearch Results\n*Date Range:* {{2.dateRange.from}} to {{2.dateRange.to}}\n*Records Analyzed:* {{2.count}}\n\n---\n\n{{3.content[0].text}}\n\n---\n\n*Generated:* {{now}}',
        parse: false,
        mrkdwn: true,
        channel: 'C098UQ18476',
        channelType: 'private',
        channelWType: 'list'
      },
      module: 'slack:CreateMessage',
      version: 4,
      metadata: {
        designer: {
          x: 600,
          y: 0
        }
      },
      parameters: {
        __IMTCONN__: 4289110
      }
    }
  ],
  name: 'Data Studio Report Analysis - Metasearch Results (Last 7 Days)',
  metadata: {
    instant: false,
    version: 1,
    designer: {
      orphans: []
    },
    samples: {},
    scenario: {
      dlq: false,
      slots: null,
      dataloss: false,
      maxErrors: 3,
      autoCommit: true,
      roundtrips: 1,
      sequential: false,
      confidential: false,
      freshVariables: false,
      autoCommitTriggerLast: true
    }
  },
  scheduling: {
    type: 'indefinitely',
    interval: 900
  },
  interface: {
    input: [],
    output: []
  }
};

const scheduling = {
  enabled: false
};

console.log('\nBlueprint structure:');
console.log(JSON.stringify(blueprint, null, 2));

console.log('\nTo create this scenario, use Make MCP:');
console.log('mcp_make_scenarios_create({');
console.log('  teamId: 595770,');
console.log('  scheduling: { enabled: false },');
console.log('  blueprint: blueprint');
console.log('})');
