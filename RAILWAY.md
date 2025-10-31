# Railway Deployment Guide

## Fixing Lockfile Issues

If you encounter the error `lockfile had changes, but lockfile is frozen` during deployment, follow these steps:

1. **Update your lockfile locally**:
   ```bash
   bun run update-lockfile
   ```
   This will regenerate your `bun.lockb` file to match what would be created in the Railway environment.

2. **Commit the updated lockfile**:
   ```bash
   git add bun.lockb
   git commit -m "Update lockfile for Railway deployment"
   git push
   ```

3. **Deploy to Railway**:
   Once the updated lockfile is committed, Railway should be able to deploy successfully.

## Deployment Configuration

This project includes:

- **Dockerfile**: Uses Bun to install dependencies, build the app, and serve it
- **Caddyfile**: Configures the web server to serve the static files
- **railway.toml**: Configures Railway-specific deployment settings

## Environment Variables

Make sure to set these environment variables in your Railway project:

- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key

## Troubleshooting

If you continue to have issues with deployment:

1. Try removing the `--frozen-lockfile` flag from the Dockerfile temporarily
2. After a successful deployment, you can add it back for future deployments
3. Check Railway logs for specific error messages
