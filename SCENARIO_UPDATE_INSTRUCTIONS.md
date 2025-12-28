# Update Make.com Scenario - Instructions

The scenario blueprint update via MCP is complex due to Make.com's strict blueprint format requirements. 

## Current Status

✅ **Name Updated:** "Data Studio Report Analysis - Metasearch Results (Last 7 Days)"
✅ **Description Updated:** "Fetches last 7 days of Metasearch Results data from API, analyzes with Claude AI, and sends formatted summary to Slack"

## Required Manual Updates in Make.com

Since the blueprint structure is very complex, please make these changes manually in Make.com:

### 1. Add Webhook Trigger (First Module)

1. Open scenario: https://eu1.make.com/595770/scenarios/4003851/edit
2. Click **"Add a module"** at the start
3. Search for **"Webhooks"** → Select **"Custom webhook"**
4. Click **"Save"**
5. Copy the webhook URL (you'll need this)

### 2. Update HTTP Module (Module 6)

1. Click on the **HTTP module** (currently module 6)
2. Update the **URL** to:
   ```
   https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f/last-7-days
   ```
3. In **Headers**, add:
   - **Name:** `x-api-key`
   - **Value:** `{{apiKey}}` (or your actual API key)
4. Click **"OK"** to save

### 3. Remove Tools Aggregator (Module 8)

1. Click on the **Tools/Table aggregator** module (module 8)
2. Delete it (it's not needed)
3. Connect HTTP module directly to AI module

### 4. Replace Perplexity AI with Claude AI (Module 7)

1. Click on the **Perplexity AI** module (module 7)
2. Click **"Remove"** or replace it
3. Add new module: **"Anthropic"** → **"Create a Message"**
4. Configure:
   - **Model:** `claude-3-5-sonnet-20241022`
   - **System:** 
     ```
     You are a data analyst specializing in marketing performance data. Analyze the provided data and create a concise, actionable summary focusing on key insights, trends, and recommendations.
     ```
   - **User Message:**
     ```
     Analyze the following marketing performance data from the last 7 days:

     Report: Metasearch Results
     Date Range: {{6.dateRange.from}} to {{6.dateRange.to}}
     Total Records: {{6.count}}

     Data:
     {{6.data}}

     Please provide:
     1. Key performance metrics summary
     2. Notable trends or changes
     3. Top performing channels/campaigns
     4. Areas of concern or opportunities
     5. Actionable recommendations

     Format the response in a clear, structured way suitable for a Slack message.
     ```
5. Connect your Anthropic account if needed
6. Click **"OK"** to save

### 5. Update Slack Module (Module 3)

1. Click on the **Slack** module (module 3)
2. Update the **Text** field to:
   ```
   📊 *Data Studio Report Analysis - Last 7 Days*

   *Report:* Metasearch Results
   *Date Range:* {{6.dateRange.from}} to {{6.dateRange.to}}
   *Records Analyzed:* {{6.count}}

   ---

   {{7.content[0].text}}

   ---

   *Generated:* {{now}}
   ```
3. Click **"OK"** to save

### 6. Connect Modules

Ensure the flow is:
- **Webhook** → **HTTP** → **Claude AI** → **Slack**

### 7. Test

1. Click **"Run once"** to test
2. Check each module's output
3. Verify the Slack message is sent correctly

## Final Workflow Structure

```
Webhook (Trigger)
  ↓
HTTP - Get Last 7 Days Data
  ↓
Claude AI - Analyze Data
  ↓
Slack - Send Message
```

## Variables Reference

- `{{6.dateRange.from}}` - Start date from HTTP response
- `{{6.dateRange.to}}` - End date from HTTP response  
- `{{6.count}}` - Record count from HTTP response
- `{{6.data}}` - Data array from HTTP response
- `{{7.content[0].text}}` - Claude AI analysis response
- `{{now}}` - Current timestamp

## Next Steps

After making these changes:
1. Test the workflow
2. Activate the scenario
3. Set up scheduling (optional)
4. Use webhook URL to trigger manually
