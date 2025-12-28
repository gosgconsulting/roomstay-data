# Create Make.com Workflow - Manual Setup Guide

Since the Make.com API has strict blueprint format requirements, here's a step-by-step guide to create the workflow manually in Make.com UI.

## Quick Setup (5 minutes)

### Step 1: Create New Scenario

1. Go to https://www.make.com
2. Click **"Create a new scenario"**
3. Name it: `Data Studio Report Analysis - Metasearch Results`

### Step 2: Add Webhook Module (Trigger)

1. Click **"Add a module"**
2. Search for **"Webhooks"** → Select **"Custom webhook"**
3. Click **"Save"** to create the webhook
4. **Copy the webhook URL** - You'll use this to trigger the workflow

**Webhook URL will look like:**
```
https://hook.make.com/abc123xyz...
```

### Step 3: Add HTTP Module (Get Data)

1. Click **"Add a module"** after the webhook
2. Search for **"HTTP"** → Select **"Make an HTTP request"**
3. Configure:

**Method:** `GET`

**URL:**
```
https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f/last-7-days
```

**Headers:**
- **Name:** `x-api-key`
- **Value:** `rs_your_api_key_here` (get from API key generation)

**Click "OK"** to save

### Step 4: Add Claude AI Module

1. Click **"Add a module"** after HTTP
2. Search for **"Anthropic"** or **"Claude"** → Select **"Create a Message"**
3. If not installed, click **"Add"** to install
4. Connect your Anthropic account (enter Claude API key)
5. Configure:

**Model:** `claude-3-5-sonnet-20241022`

**System:**
```
You are a data analyst specializing in marketing performance data. Analyze the provided data and create a concise, actionable summary focusing on key insights, trends, and recommendations.
```

**User Message:**
```
Analyze the following marketing performance data from the last 7 days:

Report: Metasearch Results
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

Format the response in a clear, structured way suitable for a Slack message.
```

**Click "OK"** to save

### Step 5: Add Slack Module

1. Click **"Add a module"** after Claude AI
2. Search for **"Slack"** → Select **"Create a Message"**
3. If not installed, click **"Add"** to install
4. Connect your Slack workspace
5. Configure:

**Channel:** `#data-reports` (or your channel)

**Text:**
```
📊 *Data Studio Report Analysis - Last 7 Days*

*Report:* Metasearch Results
*Date Range:* {{2.dateRange.from}} to {{2.dateRange.to}}
*Records Analyzed:* {{2.count}}

---

{{3.content[0].text}}

---

*Generated:* {{now}}
```

**Click "OK"** to save

### Step 6: Connect the Modules

The modules should automatically connect in sequence:
- Webhook → HTTP → Claude AI → Slack

If not, drag connections between modules.

### Step 7: Test the Workflow

1. Click **"Run once"** button (top right)
2. Check each module's output:
   - Webhook: Should show received data
   - HTTP: Should show API response with data
   - Claude AI: Should show analysis
   - Slack: Should show message sent

### Step 8: Activate

1. Toggle the scenario to **"ON"** (top right)
2. Set up scheduling (optional):
   - Click **"Schedule"** icon
   - Set to **"Daily"** at **9:00 AM**
   - Save

## Module Configuration Summary

### 1. Webhook (Trigger)
- **Type:** Custom webhook
- **Path:** Auto-generated
- **URL:** Copy this for triggering

### 2. HTTP (Get Data)
- **Method:** GET
- **URL:** `https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f/last-7-days`
- **Header:** `x-api-key: rs_your_api_key`

### 3. Claude AI (Analysis)
- **Model:** claude-3-5-sonnet-20241022
- **System:** Data analyst prompt
- **User:** Analysis request with data variables

### 4. Slack (Notification)
- **Channel:** #data-reports
- **Text:** Formatted message with variables

## Variables Reference

In Make.com, use these variables:

- `{{2.dateRange.from}}` - Start date (from HTTP response)
- `{{2.dateRange.to}}` - End date (from HTTP response)
- `{{2.count}}` - Number of records (from HTTP response)
- `{{2.data}}` - The data array (from HTTP response)
- `{{3.content[0].text}}` - Claude AI analysis (from Claude response)
- `{{now}}` - Current timestamp

## Getting Your Report API Key

If you don't have an API key yet:

```bash
curl -X POST https://yourdomain.com/api/keys/generate \
  -H "Content-Type: application/json" \
  -d '{
    "reportId": "4b41d292-13f7-4695-81f9-0b4ee1761c9f",
    "name": "Make.com API Key",
    "description": "API key for Make.com workflow"
  }'
```

**⚠️ Save the `apiKey` from the response - it's only shown once!**

## Testing

### Test Webhook

```bash
curl -X POST https://hook.make.com/your-webhook-id \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Test API Endpoint

```bash
curl "https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f/last-7-days" \
  -H "x-api-key: rs_your_api_key_here"
```

## Troubleshooting

### HTTP Module Returns 401
- **Issue:** API key missing or incorrect
- **Fix:** Check the `x-api-key` header value in HTTP module

### Claude AI Fails
- **Issue:** API key not connected or invalid
- **Fix:** Reconnect Anthropic account in Claude module

### Slack Message Not Sent
- **Issue:** Slack not connected or channel wrong
- **Fix:** Reconnect Slack and verify channel name

### No Data Returned
- **Issue:** Report has no data for last 7 days
- **Fix:** Check if data exists, or adjust date range

## Scheduling Options

### Daily at 9 AM
1. Click **"Schedule"** icon
2. Select **"Daily"**
3. Set time to **9:00 AM**
4. Save

### Weekly on Monday
1. Click **"Schedule"** icon
2. Select **"Weekly"**
3. Choose **Monday**
4. Set time
5. Save

### Manual Trigger Only
- Leave scheduling disabled
- Use webhook URL to trigger manually

## Webhook URL

After creating the webhook, you'll get a URL like:
```
https://hook.make.com/abc123xyz789
```

Use this to trigger the workflow:
```bash
curl -X POST https://hook.make.com/abc123xyz789
```

## Next Steps

1. ✅ Create the scenario (5 minutes)
2. ✅ Configure all modules
3. ✅ Test with "Run once"
4. ✅ Activate the scenario
5. ✅ Set up scheduling (optional)
6. ✅ Monitor executions in Make.com

## Support

If you encounter issues:
1. Check Make.com execution logs
2. Verify API key is correct
3. Test API endpoint directly
4. Check module connections
