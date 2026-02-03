/**
 * Helper functions for managing booking status in dimension_values JSONB
 */

import { supabase } from "@/integrations/supabase/client";
import { resolveDimensionNameToId } from "./data-sources/dimensionMapping";

/**
 * Get or create "Status" dimension for the Booking report
 */
export async function getOrCreateStatusDimension(
  reportId: string,
  userId: string,
  accountId?: string | null
): Promise<string> {
  // First, try to find existing "Status" dimension
  const existingDimId = await resolveDimensionNameToId(
    "Status",
    accountId || null,
    reportId,
    userId
  );

  if (existingDimId) {
    return existingDimId;
  }

  // If not found, create a new "Status" dimension
  // Find a data source for this report to use as data_source_id
  const { data: dataSources } = await supabase
    .from("data_sources")
    .select("id")
    .eq("report_id", reportId)
    .limit(1);

  const dataSourceId = dataSources && dataSources.length > 0 ? dataSources[0].id : null;

  const { data: newDimension, error: createError } = await supabase
    .from("dimensions")
    .insert({
      user_id: userId,
      report_id: reportId,
      data_source_id: dataSourceId,
      name: "Status",
      type: "text",
      scope: accountId ? "account" : "custom",
      account_id: accountId || null,
    })
    .select()
    .single();

  if (createError) {
    console.error("Error creating Status dimension:", createError);
    throw createError;
  }

  return newDimension.id;
}

/**
 * Find the dimension_data row matching a specific booking
 */
export async function findDimensionDataRow(
  reportId: string,
  hotelDimensionId: string,
  bookingNumberDimensionId: string,
  checkoutDateDimensionId: string,
  hotelValue: string,
  bookingNumberValue: string,
  checkoutDateValue: string
): Promise<{ id: string; dimension_values: Record<string, any> } | null> {
  // Format checkout date to YYYY-MM-DD for consistent matching
  let checkoutDateStr = "";
  try {
    const date = new Date(checkoutDateValue);
    if (!isNaN(date.getTime())) {
      checkoutDateStr = date.toISOString().split("T")[0];
    } else {
      // If date parsing fails, try to use the value as-is if it's already in YYYY-MM-DD format
      if (typeof checkoutDateValue === "string" && checkoutDateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
        checkoutDateStr = checkoutDateValue;
      }
    }
  } catch {
    // If date parsing fails, try to use the value as-is
    if (typeof checkoutDateValue === "string" && checkoutDateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      checkoutDateStr = checkoutDateValue;
    }
  }

  if (!checkoutDateStr) {
    console.warn("Invalid checkout date format:", checkoutDateValue);
    return null;
  }

  // Query dimension_data using JSONB operators
  // Note: Supabase PostgREST doesn't support parameterized JSONB path queries directly
  // We need to use RPC or construct the query differently
  // For now, we'll fetch all rows for the report and filter in memory
  // This is less efficient but works with Supabase client limitations

  const { data: allRows, error } = await supabase
    .from("dimension_data")
    .select("id, dimension_values")
    .eq("report_id", reportId);

  if (error) {
    console.error("Error fetching dimension_data rows:", error);
    throw error;
  }

  if (!allRows) {
    return null;
  }

  // Filter rows in memory to find matching booking
  const matchingRow = allRows.find((row) => {
    const dimValues = row.dimension_values as Record<string, any>;
    const rowHotel = String(dimValues[hotelDimensionId] || "").trim();
    const rowBookingNumber = String(dimValues[bookingNumberDimensionId] || "").trim();
    const rowCheckoutDate = dimValues[checkoutDateDimensionId];

    // Format row checkout date for comparison
    let rowCheckoutDateStr = "";
    if (rowCheckoutDate) {
      try {
        const date = new Date(rowCheckoutDate);
        if (!isNaN(date.getTime())) {
          rowCheckoutDateStr = date.toISOString().split("T")[0];
        } else if (typeof rowCheckoutDate === "string" && rowCheckoutDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          rowCheckoutDateStr = rowCheckoutDate;
        }
      } catch {
        if (typeof rowCheckoutDate === "string" && rowCheckoutDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          rowCheckoutDateStr = rowCheckoutDate;
        }
      }
    }

    return (
      rowHotel === hotelValue.trim() &&
      rowBookingNumber === bookingNumberValue.trim() &&
      rowCheckoutDateStr === checkoutDateStr
    );
  });

  if (!matchingRow) return null;
  
  // Cast to proper return type
  return {
    id: matchingRow.id,
    dimension_values: matchingRow.dimension_values as Record<string, any>,
  };
}

/**
 * Update booking status in dimension_values JSONB
 */
export async function updateBookingStatus(
  dimensionDataRowId: string,
  statusDimensionId: string,
  statusValue: string | null
): Promise<void> {
  // Fetch current row to preserve all existing dimension values
  const { data: currentRow, error: fetchError } = await supabase
    .from("dimension_data")
    .select("dimension_values")
    .eq("id", dimensionDataRowId)
    .single();

  if (fetchError) {
    console.error("Error fetching dimension_data row:", fetchError);
    throw fetchError;
  }

  if (!currentRow) {
    throw new Error(`Dimension data row not found: ${dimensionDataRowId}`);
  }

  // Update dimension_values with status
  const updatedValues = {
    ...(currentRow.dimension_values as Record<string, any>),
    [statusDimensionId]: statusValue || null,
  };

  // Update the row
  const { error: updateError } = await supabase
    .from("dimension_data")
    .update({ dimension_values: updatedValues })
    .eq("id", dimensionDataRowId);

  if (updateError) {
    console.error("Error updating dimension_data row:", updateError);
    throw updateError;
  }
}
