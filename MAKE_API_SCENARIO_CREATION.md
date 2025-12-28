# Create Make.com Scenario via API

This guide explains how to create a Make.com scenario programmatically using the Make.com API.

## Overview

Instead of manually creating the scenario in Make.com, you can use our API endpoint to create it automatically with all modules configured.

## Prerequisites

1. **Make.com API Token**
   - Go to Make.com → Profile → API
   - Generate a new API token
   - Copy the token (you'll need it)

2. **Team ID**
   - Go to Make.com → Team settings
   - Find your Team ID (usually a number)

3. **Report Information**
   - Report ID
   - Report Name
   - API Key for the report

4. **Slack Configuration** (optional)
   - Slack channel name (e.g., `#data-reports`)
   - OR Slack webhook URL

5. **Claude API Key** (optional, can be set later in Make.com)

## API Endpoint

**POST** `/api/make/create-scenario`

**URL:**
```
https://yourdomain.com/api/make/create-scenario
```

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "reportId": "4b41d292-13f7-4695-81f9-0b4ee1761c9f",
  "reportName": "Metasearch Results",
  "makeApiToken": "your-make-api-token",
  "teamId": "123456",
  "slackChannel": "#data-reports",
  "slackWebhookUrl": "https://hooks.slack.com/services/...",
  "claudeApiKey": "sk-ant-...",
  "makeRegion": "us1"
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reportId` | string | Yes | UUID of the report |
| `reportName` | string | Yes | Name of the report (for display) |
| `makeApiToken` | string | Yes | Make.com API token |
| `teamId` | string | Yes | Make.com team ID |
| `slackChannel` | string | No | Slack channel name (e.g., `#data-reports`) |
| `slackWebhookUrl` | string | No | Slack webhook URL (alternative to channel) |
| `claudeApiKey` | string | No | Claude API key (can be set later) |
| `makeRegion` | string | No | Make.com region: `us1` (default) or `eu1` |

## Example Request

### Using cURL

```bash
curl -X POST https://yourdomain.com/api/make/create-scenario \
  -H "Content-Type: application/json" \
  -d '{
    "reportId": "4b41d292-13f7-4695-81f9-0b4ee1761c9f",
    "reportName": "Metasearch Results",
    "makeApiToken": "your-make-api-token-here",
    "teamId": "123456",
    "slackChannel": "#data-reports",
    "makeRegion": "us1"
  }'
```

### Using JavaScript/Node.js

```javascript
const response = await fetch('https://yourdomain.com/api/make/create-scenario', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    reportId: '4b41d292-13f7-4695-81f9-0b4ee1761c9f',
    reportName: 'Metasearch Results',
    makeApiToken: 'your-make-api-token',
    teamId: '123456',
    slackChannel: '#data-reports'
  })
});

const result = await response.json();
console.log(result);
```

## Response

### Success Response (201)

```json
{
  "success": true,
  "message": "Make.com scenario created successfully",
  "scenario": {
    "id": 12345678,
    "name": "Data Studio Report Analysis",
    "url": "https://us1.make.com/scenario/12345678/editor",
    "blueprint": {...}
  }
}
```

### Error Response (400/500)

```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details"
}
```

## Created Scenario Structure

The API creates a scenario with the following modules:

1. **Webhook Trigger**
   - Custom webhook endpoint
   - Path: `report-analysis-{reportId-prefix}`

2. **HTTP Module - Get Last 7 Days Data**
   - URL: `https://yourdomain.com/api/make/reports/{reportId}/last-7-days`
   - Method: GET
   - Headers: `x-api-key` (needs to be configured in Make.com)

3. **Claude AI Module**
   - Model: `claude-3-5-sonnet-20241022`
   - System prompt: Pre-configured for data analysis
   - User prompt: Includes report data and analysis instructions

4. **Slack Module**
   - Channel: As specified in request
   - OR Webhook URL: If provided
   - Message: Formatted with report data and AI analysis

## After Scenario Creation

### 1. Configure API Key

1. Open the scenario in Make.com
2. Click on the "Get Last 7 Days Data" HTTP module
3. In the `x-api-key` header, replace `{{apiKey}}` with your actual API key
4. Or create a variable in Make.com for the API key

### 2. Connect Claude AI

1. Click on the "Claude AI Analysis" module
2. If not connected, click "Add" to connect your Anthropic account
3. Enter your Claude API key if not provided in the request

### 3. Connect Slack

1. Click on the "Send to Slack" module
2. If not connected, click "Add" to connect your Slack workspace
3. Select the channel (if using channel method)

### 4. Test the Scenario

1. Click "Run once" to test
2. Check each module's output
3. Verify data flows correctly

### 5. Activate the Scenario

1. Toggle the scenario to "ON"
2. Set up scheduling if needed
3. Or use the webhook URL to trigger manually

## Getting Make.com API Token

1. Log in to Make.com
2. Click your profile name (bottom left)
3. Select **"Profile"**
4. Go to **"API"** tab
5. Click **"Generate a new token"**
6. Copy the token (starts with `Token `)

## Getting Team ID

1. Go to Make.com
2. Click **"Team"** in the left menu
3. Go to **"Team settings"**
4. The Team ID is shown in the URL or settings page
5. It's usually a number like `123456`

## Make.com Regions

- **US Region:** `us1` (default)
  - API URL: `https://us1.make.com/api/v2/scenarios`
  
- **EU Region:** `eu1`
  - API URL: `https://eu1.make.com/api/v2/scenarios`

Check your Make.com URL to determine your region:
- `https://us1.make.com/...` → Use `us1`
- `https://eu1.make.com/...` → Use `eu1`

## Creating Multiple Scenarios

To create scenarios for multiple reports, call the API endpoint for each report:

```bash
# Report 1
curl -X POST https://yourdomain.com/api/make/create-scenario \
  -H "Content-Type: application/json" \
  -d '{
    "reportId": "report-id-1",
    "reportName": "Report 1",
    "makeApiToken": "your-token",
    "teamId": "123456",
    "slackChannel": "#data-reports"
  }'

# Report 2
curl -X POST https://yourdomain.com/api/make/create-scenario \
  -H "Content-Type: application/json" \
  -d '{
    "reportId": "report-id-2",
    "reportName": "Report 2",
    "makeApiToken": "your-token",
    "teamId": "123456",
    "slackChannel": "#data-reports"
  }'
```

## Troubleshooting

### Error: "Missing required fields"

**Solution:** Ensure all required fields are provided:
- `reportId`
- `reportName`
- `makeApiToken`
- `teamId`

### Error: "Failed to create Make.com scenario"

**Possible causes:**
1. Invalid API token
2. Invalid team ID
3. Insufficient permissions
4. Make.com API error

**Solution:**
1. Verify API token is correct
2. Check team ID
3. Ensure API token has `scenarios:write` permission
4. Check Make.com API status

### Error: "Unauthorized"

**Solution:**
1. Verify Make.com API token is valid
2. Check token hasn't expired
3. Ensure token has correct permissions

### Scenario Created But Modules Not Working

**Solution:**
1. Open scenario in Make.com
2. Configure API key in HTTP module
3. Connect Claude AI account
4. Connect Slack account
5. Test each module individually

## Security Notes

1. **API Tokens:**
   - Never commit Make.com API tokens to version control
   - Store in environment variables
   - Rotate tokens regularly

2. **API Keys:**
   - Report API keys should be stored securely in Make.com
   - Use Make.com's credential vault
   - Don't hardcode in scenarios

3. **Webhook URLs:**
   - Keep webhook URLs private
   - Consider adding webhook secret validation
   - Use HTTPS only

## Next Steps

After creating the scenario:

1. **Configure credentials** in Make.com
2. **Test the workflow** with "Run once"
3. **Activate the scenario**
4. **Set up scheduling** (optional)
5. **Monitor executions** in Make.com

## Example: Complete Setup Script

```javascript
// create-make-scenarios.js
const reports = [
  { id: '4b41d292-13f7-4695-81f9-0b4ee1761c9f', name: 'Metasearch Results' },
  { id: 'another-report-id', name: 'SEM Report' },
  // Add more reports...
];

const makeApiToken = process.env.MAKE_API_TOKEN;
const teamId = process.env.MAKE_TEAM_ID;

for (const report of reports) {
  const response = await fetch('https://yourdomain.com/api/make/create-scenario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reportId: report.id,
      reportName: report.name,
      makeApiToken,
      teamId,
      slackChannel: '#data-reports'
    })
  });
  
  const result = await response.json();
  console.log(`Created scenario for ${report.name}:`, result.scenario?.url);
}
```
