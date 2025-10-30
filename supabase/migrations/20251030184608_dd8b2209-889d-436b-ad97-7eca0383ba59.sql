-- Make reports and data publicly readable (no authentication required)

-- Allow public read access to reports
CREATE POLICY "Public can view all reports"
ON public.reports
FOR SELECT
TO anon
USING (true);

-- Allow public read access to data_sources
CREATE POLICY "Public can view all data sources"
ON public.data_sources
FOR SELECT
TO anon
USING (true);

-- Allow public read access to dimensions
CREATE POLICY "Public can view all dimensions"
ON public.dimensions
FOR SELECT
TO anon
USING (true);

-- Allow public read access to dimension_data
CREATE POLICY "Public can view all dimension data"
ON public.dimension_data
FOR SELECT
TO anon
USING (true);

-- Allow public read access to report_views
CREATE POLICY "Public can view all report views"
ON public.report_views
FOR SELECT
TO anon
USING (true);

-- Allow public read access to sheet_data
CREATE POLICY "Public can view all sheet data"
ON public.sheet_data
FOR SELECT
TO anon
USING (true);