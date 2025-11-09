# Supabase CORS & Authentication Fix

## Issues Identified

The sign-in process is failing due to multiple Supabase-related issues:

1. **CORS Policy Error**: `localhost:8081` is not in the allowed origins
2. **Network Errors**: 522 errors indicating connection timeouts
3. **Auth Token Refresh Failures**: Multiple retry failures
4. **Port Mismatch**: Vite config was set to 8080 but app running on 8081

## Fixes Applied

### 1. Vite Configuration Updated ✅
**File**: `vite.config.ts`
```typescript
server: {
  host: "::",
  port: 8081,  // ← Fixed to match actual port
  cors: true,  // ← Added CORS support
},
```

### 2. Supabase Client Configuration Enhanced ✅
**File**: `src/integrations/supabase/client.ts`
```typescript
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,  // ← Added
    flowType: 'pkce'          // ← Added for better security
  },
  global: {
    headers: {
      'Access-Control-Allow-Origin': '*',  // ← Added
    },
  },
  db: {
    schema: 'public'  // ← Added
  },
  realtime: {
    params: {
      eventsPerSecond: 10  // ← Added rate limiting
    }
  }
});
```

## Manual Steps Required

### 1. Update Supabase Project Settings

**Go to Supabase Dashboard → Your Project → Settings → API**

Add these URLs to **Site URL** and **Redirect URLs**:
```
http://localhost:8081
http://localhost:8080
http://127.0.0.1:8081
http://127.0.0.1:8080
```

### 2. Update Authentication Settings

**Go to Supabase Dashboard → Authentication → URL Configuration**

**Site URL**: `http://localhost:8081`

**Redirect URLs** (add all of these):
```
http://localhost:8081/**
http://localhost:8080/**
http://127.0.0.1:8081/**
http://127.0.0.1:8080/**
```

### 3. Check Network Configuration

**Go to Supabase Dashboard → Settings → API**

Ensure these settings:
- **Auto-refresh tokens**: Enabled
- **Additional redirect URLs**: Include localhost variants
- **CORS origins**: Include localhost:8081

## Alternative Solutions

### Option 1: Use Different Port
If CORS issues persist, try changing to a standard port:

**vite.config.ts**:
```typescript
server: {
  host: "::",
  port: 3000,  // Standard React port
  cors: true,
},
```

Then update Supabase settings to include `http://localhost:3000`

### Option 2: Use Environment Variables
Update the client configuration to use environment variables:

**src/integrations/supabase/client.ts**:
```typescript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://zcxxwpwheevwavdcgfht.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "your-key";
```

### Option 3: Add Retry Logic
Add retry logic for failed authentication attempts:

```typescript
const retryAuth = async (maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error) return { data, error };
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};
```

## Testing Steps

After making the changes:

1. **Restart Development Server**: `npm run dev`
2. **Clear Browser Cache**: Hard refresh (Ctrl+Shift+R)
3. **Check Console**: Verify no CORS errors
4. **Test Sign In**: Try authentication flow
5. **Monitor Network Tab**: Check for 522 errors

## Expected Resolution

After applying these fixes:
- ✅ **CORS errors should be resolved**
- ✅ **Port consistency maintained**
- ✅ **Authentication should work properly**
- ✅ **Network timeouts reduced**
- ✅ **Token refresh should work**

## If Issues Persist

1. **Check Supabase Status**: Visit status.supabase.com
2. **Try Different Network**: Test on different connection
3. **Clear All Storage**: Clear localStorage and sessionStorage
4. **Check Firewall**: Ensure no blocking of Supabase domains
5. **Contact Support**: If Supabase service issues persist

The main issue is likely the CORS configuration in the Supabase project settings that needs to be updated to include `http://localhost:8081`.
