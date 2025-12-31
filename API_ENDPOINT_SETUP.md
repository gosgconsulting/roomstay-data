# Public API Endpoint Setup

## Overview

A public API endpoint has been created to access report data via your domain (not Supabase URL).

**Endpoint Formats:**
```
GET /api/reports/:reportId          # Single report with parameters
GET /api/reports/card/:cardId       # AI Summary card (simplified, uses card configuration)
```

**Examples:**
- Single Report: `http://localhost:3000/api/reports/2eff17d0-38de-4d5d-a15b-69ad13788c92`
- Card-based (Recommended): `http://localhost:3000/api/reports/card/f48ba962-5913-43ee-9ed0-caafaba29a62`
- Production: `https://yourdomain.com/api/reports/card/f48ba962-5913-43ee-9ed0-caafaba29a62`

## Response Format

Similar to the example API format:

```json
{
  "success": true,
  "count": 1234,
  "data": [
    {
      "id": "reportId_current_0",
      "period": "current",
      "date_from": "2025-11-01",
      "date_to": "2025-12-29",
      "row_number": 1,
      ...dimension_values
    },
    ...
  ],
  "periods": {
    "current": {
      "date_from": "2025-11-01",
      "date_to": "2025-12-29",
      "count": 617
    },
    "comparison": {
      "date_from": "2024-11-01",
      "date_to": "2024-12-29",
      "count": 617
    }
  }
}
```

## Environment Variables Required

### For Production (Railway/Server):

1. **SUPABASE_SERVICE_ROLE_KEY** (Required)
   - Service role key from Supabase dashboard
   - Needed for server-side database access to bypass RLS (Row Level Security)
   - **Critical**: Without this, the `/api/reports/card/:cardId` endpoint will fail with RLS errors
   - Get it from: Supabase Dashboard → Settings → API → service_role key
   - **Security Note**: Never expose this key in client-side code. It bypasses all RLS policies.

2. **VITE_SUPABASE_URL** or **SUPABASE_URL** (Optional)
   - Defaults to: `https://zcxxwpwheevwavdcgfht.supabase.co`
   - Your Supabase project URL

3. **PORT** (Optional)
   - Defaults to: `3000`
   - Port the server listens on

### For Local Development:

Create a `.env` file in the project root:

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
VITE_SUPABASE_URL=https://zcxxwpwheevwavdcgfht.supabase.co
PORT=3000
```

## Running Locally

### Development Mode (with Vite dev server):

1. **Terminal 1** - Start Vite dev server:
   ```bash
   npm run dev
   # or
   bun run dev
   ```

2. **Terminal 2** - Start API server:
   ```bash
   npm run dev:server
   # or
   bun run dev:server
   ```

The Vite dev server (port 8080) will proxy `/api/*` requests to the Express server (port 3000).

### Production Mode:

1. Build the app:
   ```bash
   npm run build
   ```

2. Start the server:
   ```bash
   npm start
   # or
   bun run start
   ```

The server will:
- Serve API routes at `/api/reports/:reportId`
- Serve static files from `/dist`
- Handle React Router routes

## Testing the API

### Using curl:

```bash
# Test on localhost
curl http://localhost:3000/api/reports/2eff17d0-38de-4d5d-a15b-69ad13788c92

# Test on production domain
curl https://yourdomain.com/api/reports/2eff17d0-38de-4d5d-a15b-69ad13788c92
```

### Using browser:

Simply navigate to:
```
http://localhost:3000/api/reports/2eff17d0-38de-4d5d-a15b-69ad13788c92
```

## CORS Configuration

The API endpoint is configured to allow requests from any origin:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

## Data Availability

The API returns data from the `report_api_data` table, which is automatically populated:
- During auto-sync operations
- When data sources are manually synced

If no data is available, the API returns:
```json
{
  "success": true,
  "count": 0,
  "data": [],
  "message": "No data found for this report. Data may not have been synced yet."
}
```

## Deployment

The Dockerfile has been updated to:
1. Build the React app
2. Install dependencies (including Express)
3. Run the Express server that serves both API routes and static files

No additional configuration needed - the server automatically:
- Works with localhost in development
- Works with your domain in production
- Handles CORS for public access
