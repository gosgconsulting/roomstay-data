-- Add composite index for efficient keyset pagination
CREATE INDEX IF NOT EXISTS idx_dimension_data_report_row 
ON dimension_data(report_id, row_number);

-- Add index for date filtering if date dimension exists
CREATE INDEX IF NOT EXISTS idx_dimension_data_report_created 
ON dimension_data(report_id, created_at);

-- Create server-side aggregation function for performance optimization
CREATE OR REPLACE FUNCTION get_aggregated_performance_data(
  p_report_id UUID,
  p_group_by_dims TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_breakdown_dims TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_then_by_dims TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_dimension_filters JSONB DEFAULT '{}',
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_visible_dimension_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_limit INTEGER DEFAULT 1000,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  group_key TEXT,
  dimension_values JSONB,
  row_count BIGINT
) AS $$
DECLARE
  filter_key TEXT;
  filter_value TEXT;
  where_clauses TEXT[] := ARRAY[]::TEXT[];
  group_by_clause TEXT := '';
  sql_query TEXT;
BEGIN
  -- Build WHERE clauses for dimension filters
  IF p_dimension_filters IS NOT NULL AND jsonb_typeof(p_dimension_filters) = 'object' THEN
    FOR filter_key, filter_value IN SELECT * FROM jsonb_each_text(p_dimension_filters)
    LOOP
      where_clauses := array_append(
        where_clauses, 
        format('dimension_values->>%L = %L', filter_key, filter_value)
      );
    END LOOP;
  END IF;

  -- Build dynamic GROUP BY clause
  IF array_length(p_group_by_dims, 1) > 0 THEN
    SELECT string_agg(format('dimension_values->>%L', dim), ', ')
    INTO group_by_clause
    FROM unnest(p_group_by_dims) AS dim;
  END IF;

  -- Build the dynamic SQL query
  sql_query := format(
    'SELECT 
      COALESCE(%s, ''total'') as group_key,
      jsonb_object_agg(key, value) as dimension_values,
      COUNT(*) as row_count
    FROM dimension_data,
    LATERAL jsonb_each_text(dimension_values) AS kv(key, value)
    WHERE report_id = %L',
    COALESCE(group_by_clause, '''total'''),
    p_report_id
  );

  -- Add WHERE clauses
  IF array_length(where_clauses, 1) > 0 THEN
    sql_query := sql_query || ' AND ' || array_to_string(where_clauses, ' AND ');
  END IF;

  -- Add GROUP BY if specified
  IF group_by_clause != '' THEN
    sql_query := sql_query || ' GROUP BY ' || group_by_clause;
  ELSE
    sql_query := sql_query || ' GROUP BY dimension_values';
  END IF;

  -- Add pagination
  sql_query := sql_query || format(' LIMIT %s OFFSET %s', p_limit, p_offset);

  -- Execute and return
  RETURN QUERY EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql STABLE;