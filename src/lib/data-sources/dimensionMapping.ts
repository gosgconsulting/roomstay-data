/**
 * Functions for building dimension mappings from column mappings
 */

import { supabase } from "@/integrations/supabase/client";
import type { ColumnMapping } from "./types";

/**
 * Auto-detect column type from sample values
 */
export const autoDetectColumnType = (sampleValues: any[]): { type: string; dateFormat?: string } => {
  const nonEmptyValues = sampleValues.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonEmptyValues.length === 0) return { type: 'text' };
  
  let dateCount = 0;
  let currencyCount = 0;
  let percentageCount = 0;
  let numberCount = 0;
  
  for (const value of nonEmptyValues.slice(0, 10)) {
    const stringValue = String(value).trim();
    
    if (stringValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      dateCount++;
    } else if (stringValue.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
      dateCount++;
    } else if (stringValue.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
      dateCount++;
    }
    
    const currencySymbolsRegex = /[$€£¥₹₽¢₩₦₨₫₪₭₮₯₰₱₲₳₴₵₶₷₸₹₺₻₼₽₾₿]/g;
    if (currencySymbolsRegex.test(stringValue) || stringValue.includes('$')) {
      currencyCount++;
    } else if (stringValue.includes('%')) {
      percentageCount++;
    } else if (!isNaN(parseFloat(stringValue.replace(/[,\s]/g, '')))) {
      numberCount++;
    }
  }
  
  const total = nonEmptyValues.length;
  
  if (dateCount / total >= 0.7) {
    const firstDateValue = nonEmptyValues.find(v => {
      const s = String(v).trim();
      return s.match(/^\d{4}-\d{2}-\d{2}$/) || s.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/) || s.match(/^\d{1,2}-\d{1,2}-\d{4}$/);
    });
    
    if (firstDateValue) {
      const s = String(firstDateValue).trim();
      if (s.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return { type: 'date', dateFormat: 'yyyy-mm-dd' };
      } else if (s.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        return { type: 'date', dateFormat: 'mm-dd-yyyy' };
      } else if (s.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
        return { type: 'date', dateFormat: 'dd-mm-yyyy' };
      }
    }
    return { type: 'date', dateFormat: 'yyyy-mm-dd' };
  }
  
  if (currencyCount / total >= 0.7) {
    return { type: 'currency' };
  }
  
  if (percentageCount / total >= 0.7) {
    return { type: 'percentage' };
  }
  
  if (numberCount / total >= 0.7) {
    return { type: 'number' };
  }
  
  return { type: 'text' };
};

/**
 * Resolve dimension name to ID based on account context
 */
export const resolveDimensionNameToId = async (
  dimensionName: string | null | undefined,
  accountId: string | null | undefined,
  reportId: string,
  userId: string
): Promise<string | null> => {
  if (!dimensionName || dimensionName === 'none' || dimensionName === 'create_new') {
    return null;
  }

  if (accountId) {
    const { data: accountDim } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('scope', 'account')
      .eq('account_id', accountId)
      .maybeSingle();

    if (accountDim) {
      return accountDim.id;
    }

    const { data: customDim } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('scope', 'custom')
      .eq('user_id', userId)
      .or(`report_id.eq.${reportId},report_id.is.null`)
      .maybeSingle();

    if (customDim) {
      return customDim.id;
    }

    const { data: globalDim } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('scope', 'global')
      .maybeSingle();

    if (globalDim) {
      return globalDim.id;
    }
  } else {
    const { data: customDim } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('scope', 'custom')
      .eq('user_id', userId)
      .or(`report_id.eq.${reportId},report_id.is.null`)
      .maybeSingle();

    if (customDim) {
      return customDim.id;
    }

    const { data: globalDim } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('scope', 'global')
      .maybeSingle();

    if (globalDim) {
      return globalDim.id;
    }
  }

  return null;
};

/**
 * Create or get dimension
 */
export const createOrGetDimension = async (
  mapping: ColumnMapping,
  userId: string,
  reportId: string,
  dataSourceId: string,
  accountId?: string | null
): Promise<string | null> => {
  if (mapping.newDimensionName) {
    const dimensionName = mapping.newDimensionName;
    const dimensionType = mapping.newDimensionType || mapping.dimensionType || 'text';
    
    const { data: existingDim } = await supabase
      .from('dimensions')
      .select('id')
      .eq('name', dimensionName)
      .eq('report_id', reportId)
      .eq('scope', 'custom')
      .maybeSingle();

    if (existingDim) {
      return existingDim.id;
    }

    const { data: newDimension, error: createError } = await supabase
      .from('dimensions')
      .insert({
        user_id: userId,
        report_id: reportId,
        data_source_id: dataSourceId,
        name: dimensionName,
        type: dimensionType,
        scope: 'custom',
      })
      .select()
      .single();

    if (createError) {
      console.error(`Error creating dimension ${dimensionName}:`, createError);
      throw createError;
    }
    
    return newDimension.id;
  }

  if (mapping.dimensionName) {
    return await resolveDimensionNameToId(mapping.dimensionName, accountId || null, reportId, userId);
  }

  if (mapping.dimensionId && mapping.dimensionId !== 'none' && mapping.dimensionId !== 'create_new') {
    return mapping.dimensionId;
  }

  return null;
};
