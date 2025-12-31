# Deployment Troubleshooting Guide

## "Application failed to respond" Error

If you're seeing this error, check the following:

### 1. Environment Variables

**Required for Railway/Production:**

Make sure these environment variables are set in your Railway project:

1. **SUPABASE_SERVICE_ROLE_KEY** (Required)
   - Get from: Supabase Dashboard → Settings → API → service_role key
   - This is needed for server-side database access
   - Without this, the API endpoints won't work

2. **VITE_SUPABASE_URL** or **SUPABASE_URL** (Optional)
   - Defaults to: `https://zcxxwpwheevwavdcgfht.supabase.co`
   - Your Supabase project URL

3. **PORT** (Auto-set by Railway)
   - Railway automatically sets this
   - Don't manually set it

### 2. Check Railway Logs

1. Go to Railway Dashboard
2. Click on your project
3. Click on the service
4. Go to "Deployments" tab
5. Click on the latest deployment
6. Check the logs for errors

**Look for:**
- `[SERVER] ✓ Server running on port...` - Server started successfully
- `[SERVER] ✓ Using service role key (bypasses RLS)` - Correct setup (recommended)
- `[SERVER] ⚠ Using anon key (development mode)` - RLS will apply, may cause API errors
- `[SERVER] Supabase client initialized` - Supabase configured correctly
- Any error messages starting with `[SERVER] ✗` or `[API-CARD]`

### 3. Test the Health Endpoint

Once deployed, test if the server is running:

```bash
curl https://yourdomain.com/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-12-29T...",
  "supabaseConfigured": true
}
```

If `supabaseConfigured: false`, the `SUPABASE_SERVICE_ROLE_KEY` is missing.

### 4. Common Issues

#### Issue: Server exits immediately
**Cause:** Missing `SUPABASE_SERVICE_ROLE_KEY`
**Fix:** Add the environment variable in Railway

#### Issue: Port already in use
**Cause:** Multiple instances trying to use same port
**Fix:** Railway handles this automatically, but check if you have multiple services

#### Issue: Static files not found
**Cause:** Build didn't complete or dist folder missing
**Fix:** Check build logs, ensure `bun run build` completes successfully

#### Issue: API returns 500 errors
**Cause:** Supabase client not initialized or database connection issues
**Fix:** 
- Check `SUPABASE_SERVICE_ROLE_KEY` is set correctly
- Check Supabase project is accessible
- Check `report_api_data` table exists (run migration if needed)

#### Issue: API Card endpoint returns "Cannot coerce the result to a single JSON object" (PGRST116)
**Cause:** RLS (Row Level Security) blocking access when using anon key
**Symptoms:**
- Error: `{"success":false,"error":"Cannot coerce the result to a single JSON object","details":{"code":"PGRST116","details":"The result contains 0 rows"}}`
- Server logs show: `[SERVER] ⚠ Using anon key (development mode)`

**Fix:**
1. **Recommended**: Set `SUPABASE_SERVICE_ROLE_KEY` environment variable
   - This bypasses RLS and allows server-side access
   - Get from: Supabase Dashboard → Settings → API → service_role key
2. **Alternative**: A public RLS policy has been created to allow API access
   - Policy: "Public can view AI summary cards by ID for API"
   - This allows the endpoint to work with anon key (less secure)

**Verification:**
- Check server logs on startup:
  - `[SERVER] ✓ Using service role key (bypasses RLS)` = Correct setup
  - `[SERVER] ⚠ Using anon key (development mode)` = Will have RLS issues

### 5. Setting Environment Variables in Railway

1. Go to Railway Dashboard
2. Click on your project
3. Click on the service
4. Go to "Variables" tab
5. Click "New Variable"
6. Add:
   - **Name:** `SUPABASE_SERVICE_ROLE_KEY`
   - **Value:** Your service role key from Supabase
7. Click "Add"
8. Redeploy the service

### 6. Verify Deployment

After setting environment variables and redeploying:

1. **Check health endpoint:**
   ```bash
   curl https://yourdomain.com/health
   ```

2. **Test API endpoint:**
   ```bash
   curl https://yourdomain.com/api/reports/YOUR_REPORT_ID
   ```

3. **Check server logs:**
   - Should see: `[SERVER] ✓ Server running on port...`
   - Should see: `[SERVER] Supabase client initialized`

### 7. Build Process

The Dockerfile:
1. Builds the React app (`bun run build`)
2. Installs dependencies including Express
3. Copies server.js and dist folder
4. Runs `bun server.js`

If build fails, check:
- All dependencies are in package.json
- Build script completes without errors
- dist folder is created

### 8. Server Startup Sequence

The server should:
1. ✅ Initialize Express app
2. ✅ Set up CORS
3. ✅ Initialize Supabase client (with warning if key missing)
4. ✅ Set up API routes
5. ✅ Set up static file serving (production only)
6. ✅ Start listening on PORT
7. ✅ Log success message

If any step fails, check the logs for the specific error.

### 9. Quick Fix Checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set in Railway
- [ ] Build completes successfully (check build logs)
- [ ] Server starts (check deployment logs for `[SERVER] ✓`)
- [ ] Health endpoint responds (`/health`)
- [ ] API endpoint responds (`/api/reports/:reportId`)
- [ ] Static files are served (check if app loads in browser)

### 10. Still Not Working?

If the issue persists:

1. **Check Railway logs** for specific error messages
2. **Test locally** with the same environment variables
3. **Verify Supabase connection** - test the service role key works
4. **Check Railway status** - ensure Railway service is operational
5. **Review recent changes** - check if any recent code changes broke the server
