/**
 * Functions for transforming raw data rows to table format
 */

import { supabase } from "@/integrations/supabase/client";
import type { ColumnMapping, Dimension } from "./types";
import { parseValue } from "./transformSourceData";
import { autoDetectColumnType, resolveDimensionNameToId, createOrGetDimension } from "./dimensionMapping";

/**
 * Transform data rows to table format
 */
export const transformDataRows = async (
  dataRows: any[][],
  mappings: ColumnMapping[],
  dimensionIdMap: Record<string, string>,
  columnIndexMap: Record<string, number>,
  dimensions: Dimension[]
): Promise<any[]> => {
  console.log(`[DATA-SOURCE] Transforming ${dataRows.length} data rows...`);
  
  const visibleMappings = mappings.filter(m => m.visible);
  
  // Build dimension type map from dimensions array
  const dimensionTypeMap: Record<string, string> = {};
  dimensions.forEach(dim => {
    dimensionTypeMap[dim.id] = dim.type;
  });
  
  const rowsToInsert = dataRows.map((row, index) => {
    const dimensionValues: Record<string, any> = {};
    
    if (!Array.isArray(row)) return null;
    
    visibleMappings.forEach((mapping: ColumnMapping) => {
      const colIndex = columnIndexMap[mapping.column];
      
      if (colIndex !== undefined && colIndex >= 0 && dimensionIdMap[mapping.column] && colIndex < row.length) {
        const rawValue = row[colIndex];
        const dimensionId = dimensionIdMap[mapping.column];
        const dimensionType = mapping.newDimensionType || mapping.dimensionType || dimensionTypeMap[dimensionId] || 'text';
        const dateFormat = mapping.dateFormat;
        const value = parseValue(rawValue, dimensionType, dateFormat);
        
        if (value !== null) {
          dimensionValues[dimensionId] = value;
        }
      }
    });
    
    return {
      row_number: index + 1,
      dimension_values: dimensionValues,
    };
  }).filter(row => row !== null && Object.keys(row.dimension_values).length > 0);
  
  console.log(`[DATA-SOURCE] Prepared ${rowsToInsert.length} rows for transformation`);
  return rowsToInsert;
};

/**
 * Build dimension mapping with auto-detection
 */
export const buildDimensionMappingWithAutoDetection = async (
  mappings: ColumnMapping[],
  headers: string[],
  sampleDataRows: any[][],
  userId: string,
  reportId: string,
  dataSourceId: string,
  accountId?: string | null
): Promise<{ dimensionIdMap: Record<string, string>; columnIndexMap: Record<string, number>; createdCount: number }> => {
  const dimensionIdMap: Record<string, string> = {};
  const columnIndexMap: Record<string, number> = {};
  const visibleMappings = mappings.filter(m => m.visible);
  let createdCount = 0;
  
  console.log(`[DATA-SOURCE] Total mappings: ${mappings.length}, Visible mappings: ${visibleMappings.length}`);
  
  if (visibleMappings.length === 0 && mappings.length > 0) {
    console.warn(`[DATA-SOURCE] WARNING: ${mappings.length} mappings exist but none are visible.`);
  }
  
  const normalizedHeaderMap = new Map<string, number>();
  headers.forEach((header: string, index: number) => {
    if (header && header.trim()) {
      const normalized = header.trim().toLowerCase();
      if (!normalizedHeaderMap.has(normalized)) {
        normalizedHeaderMap.set(normalized, index);
      }
    }
  });

  for (const mapping of visibleMappings) {
    let colIndex = headers.indexOf(mapping.column);
    if (colIndex === -1) {
      const normalizedMappingCol = mapping.column.trim().toLowerCase();
      colIndex = normalizedHeaderMap.get(normalizedMappingCol) ?? -1;
    }
    
    if (colIndex !== -1) {
      const sampleValues = sampleDataRows.map(row => row && row[colIndex]).filter(v => v !== null && v !== undefined);
      
      const finalMapping = { ...mapping };
      if (mapping.dimensionId === 'create_new' || !mapping.dimensionType || mapping.dimensionType === 'text') {
        const detected = autoDetectColumnType(sampleValues);
        finalMapping.newDimensionType = detected.type;
        finalMapping.dimensionType = detected.type;
        if (detected.dateFormat) {
          finalMapping.dateFormat = detected.dateFormat;
        }
      }
      
      const getDimensionName = async (m: ColumnMapping): Promise<string | null> => {
        if (m.dimensionName) {
          return m.dimensionName;
        }

        if (m.dimensionId && m.dimensionId !== 'none' && m.dimensionId !== 'create_new') {
          const { data: dimension } = await supabase
            .from('dimensions')
            .select('name')
            .eq('id', m.dimensionId)
            .maybeSingle();

          if (dimension) {
            return dimension.name;
          }
        }

        return null;
      };

      const dimensionName = await getDimensionName(finalMapping);
      
      // Prefer an explicit dimensionId first if it's set (and not a special value)
      let dimensionId: string | null = null;
      if (finalMapping.dimensionId && finalMapping.dimensionId !== 'none' && finalMapping.dimensionId !== 'create_new') {
        dimensionId = finalMapping.dimensionId;
      } else if (dimensionName) {
        // Fall back to name-based resolution
        dimensionId = await resolveDimensionNameToId(dimensionName, accountId || null, reportId, userId);
      } else if (finalMapping.newDimensionName) {
        // Or create a new dimension when requested
        dimensionId = await createOrGetDimension(finalMapping, userId, reportId, dataSourceId, accountId);
      }
      
      if (dimensionId) {
        dimensionIdMap[mapping.column] = dimensionId;
        columnIndexMap[mapping.column] = colIndex;
        
        if (mapping.dimensionId === 'create_new' || mapping.newDimensionName) {
          createdCount++;
        }
      }
    }
  }
  
  console.log(`[DATA-SOURCE] Successfully mapped ${Object.keys(dimensionIdMap).length} columns to dimensions`);
  return { dimensionIdMap, columnIndexMap, createdCount };
};