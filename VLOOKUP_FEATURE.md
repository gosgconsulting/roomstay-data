# Vlookup Feature - Pivot Dimensions

## Overview
The Vlookup feature allows users to create new text dimensions by mapping multiple existing values to single grouped values. These new dimensions become available in all performance components (Performance Table, KPI Chart, KPI Cards) and can be used as pivot dimensions for data grouping and analysis.

## Use Case Example
If you have:
- "Hotel A" → Map to "Brady" in new "Account" dimension
- "Hotel B" → Map to "Sojourn" in new "Account" dimension  
- "Hotel C" → Map to "Brady" in new "Account" dimension

When you group by the new "Account" dimension in the Performance Table, it will automatically aggregate data:
- Brady row will show combined data from Hotel A + Hotel C
- Sojourn row will show data from Hotel B

## Implementation

### Database Schema
- **Table**: `dimension_mappings`
- **Columns**:
  - `id`: UUID primary key
  - `report_id`: UUID (optional, for report-specific mappings)
  - `account_id`: UUID (optional, for account-specific mappings)
  - `user_id`: UUID (required)
  - `source_dimension_id`: UUID (the dimension to map from)
  - `source_value`: TEXT (the original value to map from)
  - `target_dimension_id`: UUID (the new dimension to map to)
  - `target_dimension_name`: TEXT (name of the new dimension)
  - `target_value`: TEXT (the grouped value to map to)
  - `created_at`, `updated_at`: Timestamps

### UI Components
1. **VlookupModal** (`src/components/VlookupModal.tsx`)
   - Clean interface for creating pivot dimensions
   - Source dimension selector
   - Multi-select for values to group
   - Target dimension name input
   - Target value input
   - Creates new dimensions automatically

2. **Button Location**
   - Dashboard header between "Dimensions" and "Budget" buttons
   - Text: "Create Pivot Dimensions"

### Data Processing
The pivot dimensions work in three ways:

1. **Automatic dimension creation**: When mappings are saved, new text dimensions are created for each unique target dimension name

2. **Real-time application**: Mappings are applied when data loads in performance components
   - Applied in `usePerformanceTableFilters` hook
   - Applied before grouping and aggregation
   - Ensures pivot dimensions work for filtering and grouping

3. **Database updates**: Edge function applies mappings to existing dimension_data
   - Updates all matching rows with target dimension values
   - Ensures data consistency across the system

### Integration with Performance Components

#### Performance Table
- Pivot dimensions appear in Group by/Breakdown by selectors
- Can be used as primary grouping dimensions
- Data is aggregated based on mapped values
- Example: Group by "Account" dimension created from vlookup

#### KPI Chart & KPI Cards
- Pivot dimensions available in dimension selectors
- Can be used for filtering and segmentation
- Metrics calculated based on grouped data

#### Filters Bar
- Pivot dimensions available as filter options
- Filter by grouped values (e.g., "Brady" matches all hotels mapped to Brady)

## Usage

1. Click "Create Pivot Dimensions" in dashboard header
2. In the modal:
   - Select source dimension (e.g., "Hotel")
   - Select values to group (e.g., "Hotel A", "Hotel B", "Hotel C")
   - Enter new dimension name (e.g., "Account")
   - Enter grouped value (e.g., "Brady")
3. Add multiple rows as needed
4. Click "Create Dimensions"
5. The system will:
   - Create new text dimensions
   - Save mappings to database
   - Apply mappings to existing data
   - Show success message with count of rows updated
6. New dimensions are immediately available in:
   - Performance Table (Group by/Breakdown by)
   - KPI Chart (dimension selector)
   - KPI Cards (dimension selector)
   - Filters Bar (filter options)

## Example Workflow

**Scenario**: Group multiple hotels under brand names for analysis

1. Open "Create Pivot Dimensions" modal
2. Create mappings:
   - Source: "Hotel" → Values: ["Brady Apartment Hotel Flinders Street", "Brady Apartment Hotel Hardware Lane"] → New Dimension: "Account" → Grouped Value: "Brady"
   - Source: "Hotel" → Values: ["Sojourn Apartment Hotel - Riddiford"] → New Dimension: "Account" → Grouped Value: "Sojourn"
3. Save mappings
4. Result:
   - New "Account" dimension created
   - All dimension_data rows updated with Account values
   - Account dimension available in all performance components
   - Can group Performance Table by Account to see aggregated data
   - Can filter by Account = "Brady" to see combined hotel data

## Features
- **Clean interface**: Simplified modal focused on creating pivot dimensions
- **Automatic dimension creation**: No need to manually create target dimensions
- **Real-time application**: Mappings work immediately when data loads
- **Universal availability**: Pivot dimensions work in all performance components
- **Data aggregation**: Automatic grouping and aggregation based on mapped values
- **Multiple mappings**: Create multiple pivot dimensions in one session
- **Account and report scope**: Mappings can be account-wide or report-specific

## Technical Notes
- Pivot dimensions are created as text dimensions with scope 'custom'
- Mappings are applied client-side during data loading for performance
- Edge function updates existing data for consistency
- RLS policies ensure users can only access their own mappings
- No complex database joins needed - mappings applied at load time

## Benefits
1. **Simplified analysis**: Group similar items without complex SQL
2. **Flexible grouping**: Create any grouping logic you need
3. **Immediate availability**: New dimensions ready to use instantly
4. **Consistent data**: All components use the same grouped values
5. **Performance optimized**: Client-side application for fast response