# Make.com API Integration Guide

This guide explains how to integrate your report data API with Make.com (formerly Integromat) workflows.

## API Endpoints

### 1. Make.com Optimized Endpoint

**Endpoint:** `GET /api/make/reports/:reportId`

**Base URL:**
- Production: `https://yourdomain.com/api/make/reports/`
- Localhost: `http://localhost:3000/api/make/reports/`

**Example:**
```
GET https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f
```

### 2. Query Parameters

The Make.com endpoint supports the following query parameters:

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `period` | string | Filter by period: `current`, `comparison`, or `both` | `current` |
| `limit` | number | Maximum number of records to return | All records |
| `offset` | number | Number of records to skip (for pagination) | `0` |
| `sortBy` | string | Field name to sort by | None |
| `sortOrder` | string | Sort order: `asc` or `desc` | `asc` |

**Examples:**

```bash
# Get current period data only
GET /api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f?period=current

# Get comparison period data only
GET /api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f?period=comparison

# Get both periods
GET /api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f?period=both

# Paginate results (first 100 records)
GET /api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f?limit=100&offset=0

# Sort by date (if date field exists in dimension_values)
GET /api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f?sortBy=date&sortOrder=desc
```

### 3. Response Format

**Success Response (200):**
```json
{
  "success": true,
  "count": 1234,
  "total": 5000,
  "data": [
    {
      "id": "4b41d292-13f7-4695-81f9-0b4ee1761c9f_current_0",
      "report_id": "4b41d292-13f7-4695-81f9-0b4ee1761c9f",
      "period": "current",
      "date_from": "2025-11-01",
      "date_to": "2025-12-29",
      "row_number": 1,
      ...dimension_values
    },
    ...
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "hasMore": true
  },
  "periods": [
    {
      "period": "current",
      "date_from": "2025-11-01",
      "date_to": "2025-12-29",
      "count": 617
    },
    {
      "period": "comparison",
      "date_from": "2024-11-01",
      "date_to": "2024-12-29",
      "count": 617
    }
  ]
}
```

**Error Response (400/500):**
```json
{
  "success": false,
  "error": "Error message",
  "count": 0,
  "data": []
}
```

## Setting Up Make.com Workflow

### Step 1: Add HTTP Module

1. In Make.com, create a new scenario
2. Add an **HTTP > Make a Request** module
3. Configure the module:

**Method:** `GET`

**URL:**
```
https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f
```

**Query String Parameters (optional):**
- `period`: `current` (or `comparison`, `both`)
- `limit`: `100` (optional, for pagination)
- `offset`: `0` (optional, for pagination)

### Step 2: Process the Response

1. Add a **Tools > Set Multiple Variables** module after the HTTP request
2. Map the response data:
   - `data`: `{{1.data}}` (array of records)
   - `count`: `{{1.count}}` (number of records returned)
   - `total`: `{{1.total}}` (total records available)

### Step 3: Iterate Over Records

1. Add an **Iterator** module
2. Set the array to: `{{2.data}}`
3. Each iteration will process one record from the response

### Step 4: Use the Data

You can now use the data in subsequent modules:
- **Google Sheets**: Add rows to a spreadsheet
- **Email**: Send reports via email
- **Slack**: Post updates to Slack
- **Database**: Store in another database
- **Webhook**: Send to another service

## Example Workflow: Daily Report to Google Sheets

1. **Schedule** (Daily at 9 AM)
2. **HTTP > Make a Request**
   - URL: `https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f?period=current`
3. **Iterator** (Process each record)
4. **Google Sheets > Add a Row**
   - Map fields from iterator to spreadsheet columns

## Webhook Support

### Webhook Endpoint

**Endpoint:** `POST /api/webhooks/make`

**URL:**
```
https://yourdomain.com/api/webhooks/make
```

**Headers:**
- `Content-Type: application/json`
- `x-webhook-secret: YOUR_SECRET` (optional, if configured)

**Body:**
```json
{
  "event": "data_synced",
  "reportId": "4b41d292-13f7-4695-81f9-0b4ee1761c9f",
  "data": {
    "syncTime": "2025-12-29T10:00:00Z"
  }
}
```

### Setting Up Webhook Secret (Optional)

For security, you can set a webhook secret:

1. Set environment variable in Railway:
   - Name: `MAKE_WEBHOOK_SECRET`
   - Value: Your secret string

2. Include in webhook requests:
   - Header: `x-webhook-secret: YOUR_SECRET`

## Pagination

For large datasets, use pagination:

**First Request:**
```
GET /api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f?limit=100&offset=0
```

**Second Request:**
```
GET /api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f?limit=100&offset=100
```

Continue until `hasMore: false` in the response.

## Make.com Module Configuration

### HTTP Module Settings

**URL:**
```
https://yourdomain.com/api/make/reports/{{reportId}}
```

**Method:** `GET`

**Headers:**
```
Content-Type: application/json
```

**Query String:**
```
period={{period}}
limit={{limit}}
offset={{offset}}
```

### Error Handling

Make.com will automatically retry on HTTP errors. Configure retry settings:
- **Max retries:** 3
- **Retry delay:** 5 seconds

## Testing

### Test the Endpoint

```bash
# Test with curl
curl "https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f?period=current&limit=10"

# Test with Make.com test mode
# Use Make.com's "Run once" feature to test the HTTP module
```

### Verify Response

Check that the response includes:
- `success: true`
- `data` array with records
- `count` matches number of records
- `pagination` object (if using pagination)

## Troubleshooting

### Issue: Empty Data Array

**Cause:** Data hasn't been synced yet
**Solution:** 
1. Manually sync the data source in the app
2. Wait for auto-sync to complete
3. Check `/health` endpoint to verify server is running

### Issue: 500 Error

**Cause:** Server configuration issue
**Solution:**
1. Check Railway logs for errors
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is set
3. Check Supabase connection

### Issue: CORS Errors

**Solution:** CORS is already configured to allow all origins. If you see CORS errors, check:
1. Server is running
2. URL is correct
3. Request method is GET

## Report ID

Your report ID: `4b41d292-13f7-4695-81f9-0b4ee1761c9f`

Use this in all API requests:
```
https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f
```

## Support

For issues or questions:
1. Check server logs in Railway
2. Test the `/health` endpoint
3. Verify report ID is correct
4. Check Make.com execution logs
