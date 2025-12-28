# Quick Start: Create Make.com Workflow

## 🚀 Fastest Way to Create the Workflow

### Step 1: Get Your Make.com Credentials

1. **API Token:**
   - Go to https://www.make.com
   - Profile → API → Generate token
   - Copy it

2. **Team ID:**
   - Make.com → Team → Settings
   - Find the number (e.g., `123456`)

### Step 2: Run the Script

```bash
# Set your credentials
export MAKE_API_TOKEN="your-token-here"
export MAKE_TEAM_ID="123456"
export API_BASE_URL="https://yourdomain.com"

# Run the script
npm run create-make-workflow
```

That's it! The workflow will be created automatically.

### Step 3: Configure in Make.com

1. Open the scenario URL from the output
2. Add your report API key in the HTTP module
3. Connect Claude AI
4. Connect Slack
5. Test and activate

## 📋 What You Need

- ✅ Make.com API token
- ✅ Make.com Team ID  
- ✅ Report API key (create one if needed)
- ✅ Slack channel or webhook URL

## 🎯 The Workflow Does

1. **Webhook** → Triggers the workflow
2. **HTTP** → Gets last 7 days of data
3. **Claude AI** → Analyzes the data
4. **Slack** → Sends insights to your channel

## 📝 Report Already Configured

The script is pre-configured for:
- **Report ID:** `4b41d292-13f7-4695-81f9-0b4ee1761c9f`
- **Report Name:** `Metasearch Results`

To add more reports, edit `create-make-workflow.js`.

## ⚡ One-Line Command

```bash
MAKE_API_TOKEN="your-token" MAKE_TEAM_ID="123456" API_BASE_URL="https://yourdomain.com" npm run create-make-workflow
```

## 🔗 After Creation

You'll get a URL like:
```
https://us1.make.com/scenario/12345678/editor
```

Open it, configure the API key, connect services, and you're done!
