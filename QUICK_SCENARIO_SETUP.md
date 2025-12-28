# Quick Scenario Setup Using Created Tool

## ✅ Tool Already Created!

I've created a Make Tool for you:
- **Tool ID:** 4004491
- **Name:** "Get Metasearch Results Last 7 Days"

## 🚀 Quick Setup (3 steps)

### Step 1: Create New Scenario

1. Go to https://eu1.make.com/595770/scenarios
2. Click **"Create a new scenario"**
3. Name it: `Metasearch Results - Last 7 Days Analysis`

### Step 2: Add Modules

1. **Add Webhook Trigger:**
   - Click "Add a module"
   - Search "Webhooks" → "Custom webhook"
   - Click "Save"

2. **Add the Tool:**
   - Click "Add a module"
   - Search for **"Get Metasearch Results Last 7 Days"** (or Tool ID: 4004491)
   - In the **apiKey** input, enter your API key or use `{{apiKey}}` variable
   - Click "OK"

3. **Add Claude AI:**
   - Click "Add a module"
   - Search "Anthropic" → "Create a Message"
   - Model: `claude-3-5-sonnet-20241022`
   - System: "You are a data analyst specializing in marketing performance data..."
   - User Message: Use data from tool output
   - Click "OK"

4. **Add Slack:**
   - Click "Add a module"
   - Search "Slack" → "Create a Message"
   - Channel: Your channel
   - Text: Format with Claude AI response
   - Click "OK"

### Step 3: Connect & Test

1. Ensure modules connect: Webhook → Tool → Claude → Slack
2. Click **"Run once"** to test
3. Activate the scenario

## 📝 Variables from Tool

- `{{tool.data}}` - The data array
- `{{tool.count}}` - Record count
- `{{tool.dateRange.from}}` - Start date
- `{{tool.dateRange.to}}` - End date

## 🎯 That's It!

The tool is ready to use. Just add it to your scenario and connect it with Claude AI and Slack!
