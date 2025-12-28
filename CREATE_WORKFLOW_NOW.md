# Create Make.com Workflow Now

Quick guide to create the Make.com workflow for your Data Studio reports.

## Quick Start

### Option 1: Using the Script (Recommended)

1. **Set your Make.com credentials:**

```bash
export MAKE_API_TOKEN="your-make-api-token"
export MAKE_TEAM_ID="123456"
export API_BASE_URL="https://yourdomain.com"
export SLACK_CHANNEL="#data-reports"
```

2. **Edit the script** (`create-make-workflow.js`) to add your reports:

```javascript
const reports = [
  {
    reportId: '4b41d292-13f7-4695-81f9-0b4ee1761c9f',
    reportName: 'Metasearch Results'
  }
  // Add more reports here
];
```

3. **Run the script:**

```bash
npm run create-make-workflow
# or
node create-make-workflow.js
```

### Option 2: Direct API Call

```bash
curl -X POST https://yourdomain.com/api/make/create-scenario \
  -H "Content-Type: application/json" \
  -d '{
    "reportId": "4b41d292-13f7-4695-81f9-0b4ee1761c9f",
    "reportName": "Metasearch Results",
    "makeApiToken": "your-make-api-token",
    "teamId": "123456",
    "slackChannel": "#data-reports",
    "makeRegion": "us1"
  }'
```

## Getting Your Credentials

### 1. Make.com API Token

1. Go to https://www.make.com
2. Click your profile (bottom left)
3. Select **"Profile"**
4. Go to **"API"** tab
5. Click **"Generate a new token"**
6. Copy the token (starts with `Token `)

### 2. Make.com Team ID

1. Go to Make.com
2. Click **"Team"** in left menu
3. Go to **"Team settings"**
4. Find your Team ID (number like `123456`)
   - Or check the URL: `https://us1.make.com/team/123456/...`

### 3. Report API Key

You need an API key for each report. Create one:

```bash
curl -X POST https://yourdomain.com/api/keys/generate \
  -H "Content-Type: application/json" \
  -d '{
    "reportId": "4b41d292-13f7-4695-81f9-0b4ee1761c9f",
    "name": "Make.com API Key",
    "description": "API key for Make.com workflow"
  }'
```

**⚠️ Save the API key** - it's only shown once!

## What Gets Created

The workflow includes:

1. **Webhook Trigger**
   - Custom webhook endpoint
   - Can be triggered manually or scheduled

2. **HTTP Module - Get Last 7 Days Data**
   - Fetches data from: `/api/make/reports/{reportId}/last-7-days`
   - Requires API key (configure after creation)

3. **Claude AI Module**
   - Analyzes the data
   - Generates insights and recommendations
   - Pre-configured prompt

4. **Slack Module**
   - Sends formatted message to Slack
   - Includes report data and AI analysis

## After Creation

### 1. Open the Scenario

Use the URL returned from the API:
```
https://us1.make.com/scenario/12345678/editor
```

### 2. Configure API Key

1. Click on **"Get Last 7 Days Data"** HTTP module
2. Find the `x-api-key` header
3. Replace `{{apiKey}}` with your actual API key
   - Or create a variable in Make.com for the API key

### 3. Connect Claude AI

1. Click on **"Claude AI Analysis"** module
2. If not connected, click **"Add"**
3. Connect your Anthropic account
4. Enter your Claude API key if needed

### 4. Connect Slack

1. Click on **"Send to Slack"** module
2. If not connected, click **"Add"**
3. Connect your Slack workspace
4. Select the channel

### 5. Test

1. Click **"Run once"** button
2. Check each module's output
3. Verify data flows correctly
4. Check Slack for the message

### 6. Activate

1. Toggle the scenario to **"ON"**
2. Set up scheduling (optional)
3. Or use webhook URL to trigger manually

## Webhook URL

After creation, get the webhook URL from Make.com:

1. Open the scenario
2. Click on the **"Custom webhook"** module
3. Copy the webhook URL
4. Use it to trigger the workflow:

```bash
curl -X POST https://hook.make.com/your-webhook-id \
  -H "Content-Type: application/json" \
  -d '{"reportId": "4b41d292-13f7-4695-81f9-0b4ee1761c9f"}'
```

## Scheduling

To run daily at 9 AM:

1. Open the scenario
2. Click **"Schedule"** icon
3. Set to **"Daily"** at **9:00 AM**
4. Save

## Troubleshooting

### "Failed to create Make.com scenario"

**Check:**
- Make.com API token is correct
- Team ID is correct
- Token has `scenarios:write` permission
- Make.com API is accessible

### "API key required" error in workflow

**Solution:**
- Configure the API key in the HTTP module
- Or create a variable in Make.com

### "Claude AI not working"

**Check:**
- Claude API key is valid
- API quota not exceeded
- Module is properly connected

### "Slack message not sent"

**Check:**
- Slack app is connected
- Channel permissions are correct
- Webhook URL is valid (if using webhook)

## Creating Multiple Workflows

Edit `create-make-workflow.js`:

```javascript
const reports = [
  {
    reportId: '4b41d292-13f7-4695-81f9-0b4ee1761c9f',
    reportName: 'Metasearch Results'
  },
  {
    reportId: 'another-report-id',
    reportName: 'SEM Report'
  },
  {
    reportId: 'yet-another-id',
    reportName: 'Social Ads'
  }
];
```

Then run:
```bash
npm run create-make-workflow
```

## Example: Complete Setup

```bash
# 1. Set credentials
export MAKE_API_TOKEN="Token abc123..."
export MAKE_TEAM_ID="123456"
export API_BASE_URL="https://yourdomain.com"
export SLACK_CHANNEL="#data-reports"

# 2. Create API key for report
curl -X POST https://yourdomain.com/api/keys/generate \
  -H "Content-Type: application/json" \
  -d '{
    "reportId": "4b41d292-13f7-4695-81f9-0b4ee1761c9f",
    "name": "Make.com API Key"
  }'
# Save the returned apiKey!

# 3. Create the workflow
npm run create-make-workflow

# 4. Open the scenario URL from the output
# 5. Configure API key in HTTP module
# 6. Connect Claude AI and Slack
# 7. Test and activate
```

## Need Help?

1. Check Make.com execution logs
2. Review server logs in Railway
3. Test API endpoints directly
4. Verify all credentials are correct
