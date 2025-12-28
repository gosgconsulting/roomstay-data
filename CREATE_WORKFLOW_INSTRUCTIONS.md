# Create Make.com Workflow - Quick Instructions

## Using Your Make.com API Token

Your Make.com API token: `6b38a4f1-1152-4a23-a805-cf5767b53590`

## Step 1: Get Your Team ID

1. Go to https://www.make.com
2. Click **"Team"** in the left menu
3. Go to **"Team settings"**
4. Find your **Team ID** (it's a number like `123456`)
   - Check the URL: `https://us1.make.com/team/123456/...`
   - Or look in team settings page

## Step 2: Run the Script

```bash
# Set your team ID
export MAKE_TEAM_ID="your-team-id-here"
export API_BASE_URL="https://yourdomain.com"

# Run the script
node create-workflow-via-api.js
```

## Alternative: Direct cURL Command

If you have your Team ID, you can call the API directly:

```bash
curl -X POST https://yourdomain.com/api/make/create-scenario \
  -H "Content-Type: application/json" \
  -d '{
    "reportId": "4b41d292-13f7-4695-81f9-0b4ee1761c9f",
    "reportName": "Metasearch Results",
    "makeApiToken": "6b38a4f1-1152-4a23-a805-cf5767b53590",
    "teamId": "your-team-id-here",
    "slackChannel": "#data-reports",
    "makeRegion": "us1"
  }'
```

## What Gets Created

The workflow will have:
1. ✅ Webhook trigger
2. ✅ HTTP module to get last 7 days data
3. ✅ Claude AI analysis module
4. ✅ Slack notification module

## After Creation

1. **Open the scenario URL** from the response
2. **Add your report API key:**
   - Click "Get Last 7 Days Data" module
   - Replace `{{apiKey}}` in the x-api-key header with your actual API key
3. **Connect Claude AI** account
4. **Connect Slack** account
5. **Test** with "Run once"
6. **Activate** the scenario

## Need Help?

- Check Make.com API token permissions
- Verify Team ID is correct
- Try different region: `makeRegion: "eu1"`
