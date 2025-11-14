#!/usr/bin/env bun
import { execSync } from 'child_process';
import fs from 'fs';

console.log('Updating lockfile to match Railway environment...');

// Backup the current lockfile
if (fs.existsSync('bun.lockb')) {
  fs.copyFileSync('bun.lockb', 'bun.lockb.backup');
  console.log('Backed up current lockfile to bun.lockb.backup');
}

// Remove the current lockfile
try {
  fs.unlinkSync('bun.lockb');
  console.log('Removed current lockfile');
} catch (err) {
  console.error('Error removing lockfile:', err);
}

// Regenerate the lockfile
try {
  console.log('Regenerating lockfile...');
  execSync('bun install', { stdio: 'inherit' });
  console.log('Lockfile updated successfully');
} catch (err) {
  console.error('Error regenerating lockfile:', err);
  
  // Restore backup if regeneration fails
  if (fs.existsSync('bun.lockb.backup')) {
    fs.copyFileSync('bun.lockb.backup', 'bun.lockb');
    console.log('Restored lockfile from backup');
  }
}

// Clean up backup
if (fs.existsSync('bun.lockb.backup')) {
  fs.unlinkSync('bun.lockb.backup');
}
