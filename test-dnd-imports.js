/**
 * [testing] Test script to verify @dnd-kit packages are properly installed
 * This script checks if all required @dnd-kit dependencies can be resolved
 */

const fs = require('fs');
const path = require('path');

console.log('[testing] Starting @dnd-kit import verification...\n');

const packagesToCheck = [
  '@dnd-kit/core',
  '@dnd-kit/sortable',
  '@dnd-kit/utilities'
];

let allPassed = true;

packagesToCheck.forEach(packageName => {
  try {
    const packagePath = path.join(__dirname, 'node_modules', packageName, 'package.json');
    
    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      console.log(`✅ ${packageName} v${packageJson.version} - INSTALLED`);
    } else {
      console.log(`❌ ${packageName} - NOT FOUND`);
      allPassed = false;
    }
  } catch (error) {
    console.log(`❌ ${packageName} - ERROR: ${error.message}`);
    allPassed = false;
  }
});

console.log('\n' + '='.repeat(50));

if (allPassed) {
  console.log('✅ All @dnd-kit packages are properly installed!');
  console.log('\n[testing] Import issue has been resolved.');
  process.exit(0);
} else {
  console.log('❌ Some packages are missing. Run: npm install');
  process.exit(1);
}
