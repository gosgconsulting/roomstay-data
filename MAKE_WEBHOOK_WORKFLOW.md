# Make.com Webhook Workflow for Data Studio Reports

This guide explains how to set up a Make.com workflow that:
1. Receives a webhook trigger for each Data Studio report
2. Fetches the last 7 days of data
3. Sends data to Claude AI for analysis
4. Sends the AI analysis to Slack

## Workflow Overview

```
Webhook Trigger → Get Last 7 Days Data → Claude AI Analysis → Slack Notification
```

## Prerequisites

1. **Make.com Account** - Sign up at https://www.make.com
2. **API Key** - Generate an API key for your report (see `API_KEY_SETUP.md`)
3. **Claude AI API Key** - Get from https://console.anthropic.com/
4. **Slack Webhook URL** - Create at https://api.slack.com/messaging/webhooks

## Step-by-Step Setup

### Step 1: Create a New Scenario in Make.com

1. Log in to Make.com
2. Click **"Create a new scenario"**
3. Name it: `Data Studio Report Analysis - [Report Name]`

### Step 2: Add Webhook Module (Trigger)

1. Click **"Add a module"**
2. Search for **"Webhooks"** → Select **"Custom webhook"**
3. Click **"Add"**
4. Click **"Save"** to create the webhook
5. **Copy the webhook URL** - You'll need this later

**Webhook URL Format:**
```
https://hook.make.com/your-unique-webhook-id
```

### Step 3: Add HTTP Module (Get Last 7 Days Data)

1. Click **"Add a module"** after the webhook
2. Search for **"HTTP"** → Select **"Make an HTTP request"**
3. Configure:

**URL:**
```
https://yourdomain.com/api/make/reports/{{reportId}}/last-7-days
```

**Method:** `GET`

**Headers:**
- **Name:** `x-api-key`
- **Value:** `rs_your_api_key_here` (your generated API key)

**Query String:** (Leave empty)

**Note:** Replace `{{reportId}}` with your actual report ID, or use a variable from the webhook.

### Step 4: Add Claude AI Module

1. Click **"Add a module"** after the HTTP module
2. Search for **"Anthropic"** or **"Claude"** → Select **"Create a Message"**
3. If not installed, click **"Add"** to install the Claude app
4. Connect your Claude API account
5. Configure:

**Model:** `claude-3-5-sonnet-20241022` (or latest)

**System Prompt:**
```
You are a data analyst specializing in marketing performance data. Analyze the provided data and create a concise, actionable summary focusing on key insights, trends, and recommendations.
```

**User Message:**
```
Analyze the following marketing performance data from the last 7 days:

Report: {{reportName}}
Date Range: {{dateFrom}} to {{dateTo}}
Total Records: {{count}}

Data:
{{data}}

Please provide:
1. Key performance metrics summary
2. Notable trends or changes
3. Top performing channels/campaigns
4. Areas of concern or opportunities
5. Actionable recommendations

Format the response in a clear, structured way suitable for a Slack message.
```

**Variables to Map:**
- `{{reportName}}` - From webhook or hardcoded
- `{{dateFrom}}` - From HTTP response: `{{2.dateRange.from}}`
- `{{dateTo}}` - From HTTP response: `{{2.dateRange.to}}`
- `{{count}}` - From HTTP response: `{{2.count}}`
- `{{data}}` - From HTTP response: `{{2.data}}` (JSON stringified)

### Step 5: Add Slack Module

1. Click **"Add a module"** after Claude AI
2. Search for **"Slack"** → Select **"Create a Message"**
3. If not installed, click **"Add"** to install the Slack app
4. Connect your Slack workspace
5. Configure:

**Channel:** Select your channel (e.g., `#data-reports`)

**Text:**
```
📊 *Data Studio Report Analysis - Last 7 Days*

*Report:* {{reportName}}
*Date Range:* {{dateFrom}} to {{dateTo}}
*Records Analyzed:* {{count}}

---

{{claudeResponse}}

---

*Generated:* {{timestamp}}
```

**Variables to Map:**
- `{{reportName}}` - From webhook or hardcoded
- `{{dateFrom}}` - From HTTP response: `{{2.dateRange.from}}`
- `{{dateTo}}` - From HTTP response: `{{2.dateRange.to}}`
- `{{count}}` - From HTTP response: `{{2.count}}`
- `{{claudeResponse}}` - From Claude AI: `{{3.content[0].text}}`
- `{{timestamp}}` - Current timestamp: `{{now}}`

### Step 6: Configure Error Handling (Optional but Recommended)

1. Click the **"Error handling"** icon (shield) at the top
2. Set **"Error handling"** to **"Break the execution"**
3. Add an **"Email"** module after error handling to notify on failures

## Alternative: Using Webhook Endpoint

Instead of using Make.com's webhook module, you can use our webhook endpoint:

**Endpoint:** `POST /api/webhooks/report-analysis/:reportId`

**URL:**
```
https://yourdomain.com/api/webhooks/report-analysis/4b41d292-13f7-4695-81f9-0b4ee1761c9f
```

**Headers:**
- `Content-Type: application/json`
- `x-webhook-secret: YOUR_SECRET` (optional, if configured)

**Body:**
```json
{
  "trigger": "scheduled",
  "metadata": {
    "source": "auto-sync"
  }
}
```

Then use **"HTTP > Make a Request"** module in Make.com to call this endpoint.

## Scheduling the Workflow

### Option 1: Schedule in Make.com

1. Click the **"Schedule"** icon at the top
2. Set to run **"Daily"** at your preferred time (e.g., 9:00 AM)
3. Save the scenario

### Option 2: Trigger from Auto-Sync

Configure your auto-sync to call the webhook after data sync completes.

## Data Format

The `/api/make/reports/:reportId/last-7-days` endpoint returns:

```json
{
  "success": true,
  "count": 1234,
  "dateRange": {
    "from": "2025-12-22",
    "to": "2025-12-29",
    "days": 7
  },
  "data": [
    {
      "id": "reportId_0",
      "report_id": "4b41d292-13f7-4695-81f9-0b4ee1761c9f",
      "row_number": 1,
      "Date": "2025-12-22",
      "Channel": "SEM",
      "Impressions": 10000,
      "Clicks": 500,
      "Cost": 1000,
      "Revenue": 5000,
      ...
    },
    ...
  ],
  "timestamp": "2025-12-29T10:00:00.000Z"
}
```

## Claude AI Prompt Template

Here's a more detailed prompt template you can use:

```
You are analyzing marketing performance data for a hotel booking platform.

Data Overview:
- Report: {{reportName}}
- Period: Last 7 days ({{dateFrom}} to {{dateTo}})
- Total Records: {{count}}

Raw Data (JSON):
{{data}}

Please analyze this data and provide:

1. **Executive Summary** (2-3 sentences)
   - Overall performance highlights
   - Key metric trends

2. **Performance Metrics**
   - Total impressions, clicks, conversions
   - Average CTR, conversion rate, CPC
   - Total cost and revenue
   - ROAS (Return on Ad Spend)

3. **Channel Performance** (if channel data available)
   - Best performing channel
   - Channel with highest ROAS
   - Channel needing attention

4. **Trends & Insights**
   - Day-over-day trends
   - Notable patterns or anomalies
   - Performance trajectory

5. **Recommendations** (3-5 actionable items)
   - What to continue doing
   - What to optimize
   - What to investigate further

Format the response as a well-structured message suitable for Slack, using:
- Bold text for headers
- Bullet points for lists
- Emojis for visual appeal (📈 📉 💰 🎯)
- Clear sections with spacing
```

## Slack Message Formatting

For better Slack formatting, use:

```
📊 *Data Studio Report Analysis*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Report:* {{reportName}}
*Period:* {{dateFrom}} → {{dateTo}}
*Records:* {{count}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{claudeResponse}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕐 Generated: {{timestamp}}
```

## Testing the Workflow

### Test Individual Modules

1. **Test Webhook:**
   ```bash
   curl -X POST https://hook.make.com/your-webhook-id \
     -H "Content-Type: application/json" \
     -d '{"reportId": "4b41d292-13f7-4695-81f9-0b4ee1761c9f"}'
   ```

2. **Test API Endpoint:**
   ```bash
   curl "https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f/last-7-days" \
     -H "x-api-key: rs_your_api_key_here"
   ```

3. **Test in Make.com:**
   - Click **"Run once"** to test the scenario
   - Check each module's output
   - Verify data flows correctly

### Common Issues

**Issue: No data returned**
- Check if report has data for last 7 days
- Verify API key is correct
- Check report ID matches

**Issue: Claude AI error**
- Verify Claude API key is valid
- Check API quota/limits
- Ensure data format is correct

**Issue: Slack message not sent**
- Verify Slack webhook URL
- Check channel permissions
- Ensure Slack app is installed

## Setting Up for Multiple Reports

### Option 1: Duplicate Scenario

1. Create the workflow for one report
2. Click **"Duplicate scenario"**
3. Update the report ID and API key
4. Save as new scenario

### Option 2: Use Variables

1. Pass `reportId` and `apiKey` in webhook payload
2. Use variables throughout the workflow:
   - `{{webhook.reportId}}`
   - `{{webhook.apiKey}}`

### Option 3: Use Router Module

1. Add a **"Router"** module after webhook
2. Create routes for each report
3. Each route has its own API key and report ID

## Advanced: Adding Filters

To filter data by specific dimensions, modify the HTTP request:

**URL with filters:**
```
https://yourdomain.com/api/make/reports/{{reportId}}/last-7-days?channel=SEM&campaign=Brand
```

(Note: Filter support can be added to the endpoint if needed)

## Monitoring & Logs

1. **Make.com Execution History:**
   - View all scenario executions
   - Check for errors
   - Review execution time

2. **Server Logs:**
   - Check Railway logs for API calls
   - Monitor webhook triggers
   - Track API key usage

3. **Slack Notifications:**
   - Set up error notifications
   - Create a dedicated channel for reports
   - Use Slack reminders for missed runs

## Cost Considerations

- **Make.com:** Free tier allows 1,000 operations/month
- **Claude AI:** Pay per token (check pricing)
- **Slack:** Free tier sufficient for basic use
- **API:** No additional cost (uses existing infrastructure)

## Security Best Practices

1. **API Keys:**
   - Store in Make.com's credential vault
   - Never hardcode in scenarios
   - Rotate regularly

2. **Webhook Secrets:**
   - Set `MAKE_WEBHOOK_SECRET` environment variable
   - Validate in webhook endpoint
   - Use HTTPS only

3. **Data Privacy:**
   - Review what data is sent to Claude AI
   - Ensure compliance with data policies
   - Consider data masking if needed

## Example Complete Workflow JSON

You can export your Make.com scenario as JSON and share it. The structure should look like:

```json
{
  "scenario": {
    "name": "Data Studio Report Analysis",
    "modules": [
      {
        "type": "webhooks",
        "name": "Custom webhook"
      },
      {
        "type": "http",
        "name": "Get Last 7 Days Data",
        "url": "https://yourdomain.com/api/make/reports/{{reportId}}/last-7-days"
      },
      {
        "type": "anthropic",
        "name": "Claude AI Analysis",
        "model": "claude-3-5-sonnet-20241022"
      },
      {
        "type": "slack",
        "name": "Send to Slack",
        "channel": "#data-reports"
      }
    ]
  }
}
```

## Support

For issues or questions:
1. Check Make.com execution logs
2. Review server logs in Railway
3. Test API endpoints directly
4. Verify all credentials are correct
