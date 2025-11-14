# Vlookup Feature

## Overview
The Vlookup feature allows users to map multiple dimension values to a single value, enabling data grouping and consolidation. This is useful for scenarios like mapping multiple hotel names to a single brand, or grouping different campaign names under a common category.

## Use Case Example
If you have:
- Hotel A → Map to "Brady"
- Hotel B → Map to "Sojourn"  
- Hotel C → Map to "Brady"

When you filter by "Brady" in the Account dimension, it will automatically group and aggregate data from both Hotel A and Hotel C.

## Implementation

### Database Schema
- **Table**: `dimension_mappings`
- **Columns**:
  - `id`: UUID primary key
  - `report_id`: UUID (optional, for report-specific mappings)
  - `account_id`: UUID (optional, for account-specific mappings)
  - `user_id`: UUID (required)
  - `source_value`: TEXT (the original value to map from)
  - `target_dimension_id`: UUID (the dimension to map to)
  - `target_value`: TEXT (the value to map to)
  - `created_at`, `updated_at`: Timestamps

### UI Components
1. **VlookupModal** (`src/components/VlookupModal.tsx`)
   - Excel-like table interface for creating mappings
   - Add/remove rows functionality
   - Dimension selector dropdown
   - Save/cancel actions
   - Automatically applies mappings to dimension_data after saving

2. **Button Location**
   - Dashboard header between "Dimensions" and "Budget" buttons
   - Icon: GitCompare (merge/mapping icon)

### Data Processing
The vlookup mappings are applied in two ways:

1. **Real-time application** in `get-performance-data` edge function:
   - Mappings are loaded at the start of the request
   - Applied to all `dimension_values` after fetching from `dimension_data` table
   - Happens before any filtering or aggregation

2. **Injection into dimension_data** via `apply-vlookup-mappings` edge function:
   - Called automatically after saving mappings in VlookupModal
   - Identifies the source dimension by analyzing dimension_data rows
   - Updates all matching rows to inject/populate the target dimension
   - Ensures the target dimension becomes available for filtering and grouping
   - Processes rows in batches for performance

### Edge Functions
- **apply-vlookup-mappings**: Injects target dimension values into dimension_data
  - Automatically finds source dimension containing the source values
  - Updates dimension_data rows with mapped target values
  - Processes in batches of 500 rows for efficiency
  - Returns count of rows updated

### Hook Integration
- **useVlookupMappings**: Custom hook for loading mappings with React Query
- **applyVlookupMappings**: Utility function for applying mappings to dimension data

## Usage

1. Click the "Vlookup" button in the dashboard header
2. In the modal:
   - Column 1: Enter the original value (e.g., "Hotel A")
   - Column 2: Select target dimension and enter mapped value (e.g., "Account" → "Brady")
3. Add multiple rows as needed using the "+ Add Row" button
4. Click "Save Mappings"
5. The system will:
   - Save the mappings to the database
   - Automatically inject the target dimension values into all matching dimension_data rows
   - Show a success message with the number of rows updated
6. The target dimension (e.g., "Account") will now be available for:
   - Filtering in the FiltersBar
   - Grouping/breakdown in reports
   - All data analysis operations

## Example Workflow

**Scenario**: You want to group multiple hotels under brand names

1. Open Vlookup modal
2. Create mappings:
   - "Brady Apartment Hotel Flinders Street" → Account → "Brady"
   - "Brady Apartment Hotel Hardware Lane" → Account → "Brady"
   - "Sojourn Apartment Hotel - Riddiford" → Account → "Sojourn"
3. Save mappings
4. Result:
   - All 21,871 dimension_data rows are updated
   - The "Account" dimension now contains "Brady" or "Sojourn" for matching hotels
   - You can now filter by Account = "Brady" to see combined data from both Brady hotels
   - The Account dimension appears in the filters and dimension selectors

## Features
- Case-insensitive matching
- Report-specific or account-wide mappings
- Real-time application during data loading
- Multiple mappings per dimension
- Excel-like editing interface

## Technical Notes
- Mappings are applied in the edge function for optimal performance
- Uses case-insensitive comparison for flexible matching
- Supports both report-level and account-level scope
- RLS policies ensure users can only access their own mappings
