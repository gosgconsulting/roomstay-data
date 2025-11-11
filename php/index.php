<?php
/**
 * Returns the latest modified CSV files by scanning directories recursively
 * 
 * This script:
 * - Recursively scans directories for CSV files
 * - Finds the file(s) with the latest modification time
 * - Returns the CSV file content directly
 */

/**
 * Recursively find all CSV files in a directory
 * 
 * @param string $dir The directory to scan
 * @param array $csvFiles Array to store found CSV files (passed by reference)
 * @return void
 */
function findCsvFiles($dir, &$csvFiles) {
    if (!is_dir($dir)) {
        return;
    }
    
    $items = scandir($dir);
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        
        $itemPath = $dir . '/' . $item;
        
        if (is_file($itemPath)) {
            // Check if it's a CSV file (case-insensitive)
            if (preg_match('/\.csv$/i', $item)) {
                $csvFiles[] = $itemPath;
            }
        } elseif (is_dir($itemPath)) {
            // Recursively search subdirectories
            findCsvFiles($itemPath, $csvFiles);
        }
    }
}

// Start scanning from the script's directory
$searchDir = __DIR__;

// Find all CSV files recursively
$csvFiles = [];
findCsvFiles($searchDir, $csvFiles);

// Check if any CSV files were found
if (empty($csvFiles)) {
    http_response_code(404);
    die("No CSV files found in '$searchDir' or its subdirectories.");
}

// Find the latest modification time
$latestTime = 0;
foreach ($csvFiles as $file) {
    $modTime = filemtime($file);
    if ($modTime > $latestTime) {
        $latestTime = $modTime;
    }
}

// Get all files with the latest modification time
$latestFiles = [];
foreach ($csvFiles as $file) {
    if (filemtime($file) == $latestTime) {
        $latestFiles[] = $file;
    }
}

// Sort by filename for consistent output
sort($latestFiles);

// Get the first latest file (or handle multiple if needed)
$latestFile = $latestFiles[0];
$filename = basename($latestFile);

// Set headers for CSV output
header('Content-Type: text/csv');
header('Content-Disposition: attachment; filename="' . $filename . '"');

// Output the CSV file directly
readfile($latestFile);
exit;
?>
