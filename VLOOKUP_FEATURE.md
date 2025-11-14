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

2. **Button Location**
   - Dashboard header between "Dimensions" and "Budget" buttons
   - Icon: GitCompare (merge/mapping icon)

### Data Processing
The vlookup mappings are applied in the `get-performance-data` edge function:

1. Mappings are loaded at the start of the request
2. Applied to all `dimension_values` after fetching from `dimension_data` table
3. Happens before any filtering or aggregation

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
5. The system will automatically apply mappings when loading data

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
