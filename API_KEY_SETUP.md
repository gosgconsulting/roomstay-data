# API Key Setup Guide

## Overview

API keys are used to authenticate requests to the Make.com API endpoint. Each API key is associated with a specific report and provides secure access to that report's data.

## Creating an API Key

### Method 1: Using the API Endpoint (Recommended)

**Endpoint:** `POST /api/keys/generate`

**Request:**
```bash
curl -X POST https://yourdomain.com/api/keys/generate \
  -H "Content-Type: application/json" \
  -d '{
    "reportId": "4b41d292-13f7-4695-81f9-0b4ee1761c9f",
    "name": "Make.com API Key",
    "description": "API key for Make.com integration"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "API key created successfully",
  "apiKey": "rs_abc123...",
  "keyPrefix": "rs_abc12",
  "id": "uuid-here",
  "reportId": "4b41d292-13f7-4695-81f9-0b4ee1761c9f",
  "name": "Make.com API Key",
  "expiresAt": null,
  "warning": "Store this API key securely. It will not be shown again."
}
```

**⚠️ IMPORTANT:** The API key is only shown once in the response. Store it securely!

### Method 2: Using Supabase SQL Editor

1. Go to Supabase Dashboard → SQL Editor
2. Run this query (replace the report ID):

```sql
-- Generate API key for report
DO $$
DECLARE
  v_report_id UUID := '4b41d292-13f7-4695-81f9-0b4ee1761c9f';
  v_api_key TEXT;
  v_key_hash TEXT;
  v_key_prefix TEXT;
  v_key_id UUID;
BEGIN
  -- Generate a secure random API key
  v_api_key := 'rs_' || encode(gen_random_bytes(32), 'hex');
  v_key_hash := encode(digest(v_api_key, 'sha256'), 'hex');
  v_key_prefix := substring(v_api_key from 1 for 8);

  -- Insert the API key
  INSERT INTO public.api_keys (
    report_id,
    key_hash,
    key_prefix,
    name,
    description,
    is_active
  ) VALUES (
    v_report_id,
    v_key_hash,
    v_key_prefix,
    'Make.com API Key',
    'API key for Make.com integration',
    true
  )
  RETURNING id INTO v_key_id;

  -- Output the API key
  RAISE NOTICE 'API Key: %', v_api_key;
  RAISE NOTICE 'Key Prefix: %', v_key_prefix;
  RAISE NOTICE 'Key ID: %', v_key_id;
END $$;
```

**Note:** The API key will appear in the "Messages" tab of the SQL Editor output.

## Using the API Key

### In Make.com

1. Add **HTTP > Make a Request** module
2. Set the URL: `https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f`
3. Add header:
   - **Name:** `x-api-key`
   - **Value:** Your API key (starts with `rs_`)

### With cURL

```bash
curl "https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f?period=current" \
  -H "x-api-key: rs_your_api_key_here"
```

### With Authorization Header

```bash
curl "https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f" \
  -H "Authorization: Bearer rs_your_api_key_here"
```

### With Query Parameter

```bash
curl "https://yourdomain.com/api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f?apiKey=rs_your_api_key_here"
```

## API Key Format

API keys follow this format:
- Prefix: `rs_` (RoomStay)
- Length: 67 characters total (`rs_` + 64 hex characters)
- Example: `rs_abc123def456...`

## Security Best Practices

1. **Store Securely**: API keys should be stored in environment variables or secure vaults
2. **Never Commit**: Never commit API keys to version control
3. **Rotate Regularly**: Generate new keys periodically and revoke old ones
4. **Use HTTPS**: Always use HTTPS when transmitting API keys
5. **Scope Access**: Each API key only provides access to one report

## Managing API Keys

### View API Keys

Query the `api_keys` table in Supabase:

```sql
SELECT 
  id,
  key_prefix,
  name,
  description,
  is_active,
  last_used_at,
  expires_at,
  created_at
FROM public.api_keys
WHERE report_id = '4b41d292-13f7-4695-81f9-0b4ee1761c9f';
```

### Revoke an API Key

```sql
UPDATE public.api_keys
SET is_active = false
WHERE id = 'your-key-id-here';
```

### Delete an API Key

```sql
DELETE FROM public.api_keys
WHERE id = 'your-key-id-here';
```

### Set Expiration

```sql
UPDATE public.api_keys
SET expires_at = '2026-12-31 23:59:59'
WHERE id = 'your-key-id-here';
```

## Troubleshooting

### Error: "API key required"

**Cause:** API key not provided in request
**Solution:** Add the API key in one of these ways:
- Header: `x-api-key: your_key`
- Header: `Authorization: Bearer your_key`
- Query: `?apiKey=your_key`

### Error: "Invalid API key"

**Cause:** API key doesn't exist or has been revoked
**Solution:** 
1. Verify the API key is correct
2. Check if the key is active: `SELECT is_active FROM api_keys WHERE key_prefix = 'rs_abc12'`
3. Generate a new API key if needed

### Error: "API key expired"

**Cause:** API key has passed its expiration date
**Solution:** Generate a new API key or update the expiration date

### Error: "API key not authorized for this report"

**Cause:** API key is for a different report
**Solution:** Use the correct API key for the report you're accessing

## Report ID

Your report ID: `4b41d292-13f7-4695-81f9-0b4ee1761c9f`

Make sure this report exists before creating an API key for it.
