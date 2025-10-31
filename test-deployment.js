#!/usr/bin/env bun
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('[testing] Starting deployment test...');

// Create a temporary directory
const tempDir = path.join(process.cwd(), 'temp-test');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

try {
  // Copy necessary files to temp directory
  console.log('[testing] Copying files to temporary directory...');
  fs.copyFileSync('package.json', path.join(tempDir, 'package.json'));
  fs.copyFileSync('bun.lockb', path.join(tempDir, 'bun.lockb'));
  fs.copyFileSync('Dockerfile', path.join(tempDir, 'Dockerfile'));

  // Change to temp directory
  process.chdir(tempDir);
  
  // Test the frozen lockfile scenario
  console.log('[testing] Testing frozen lockfile scenario...');
  try {
    execSync('bun install --frozen-lockfile', { stdio: 'inherit' });
    console.log('[testing] ✅ Frozen lockfile installation successful');
  } catch (err) {
    console.log('[testing] ❌ Frozen lockfile installation failed as expected');
    
    // Test the fallback scenario from Dockerfile
    console.log('[testing] Testing fallback installation...');
    try {
      execSync('bun install', { stdio: 'inherit' });
      console.log('[testing] ✅ Fallback installation successful');
    } catch (err) {
      console.error('[testing] ❌ Fallback installation failed:', err.message);
      process.exit(1);
    }
  }
  
  console.log('[testing] All tests completed successfully!');
} catch (err) {
  console.error('[testing] Test failed:', err.message);
  process.exit(1);
} finally {
  // Clean up
  process.chdir(process.cwd());
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
