-- Create booking_statuses table to store booking status information
CREATE TABLE IF NOT EXISTS public.booking_statuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  hotel TEXT NOT NULL,
  booking_number TEXT NOT NULL,
  checkout_date DATE NOT NULL,
  status TEXT CHECK (status IN ('', 'Confirmed', 'Cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(account_id, hotel, booking_number, checkout_date)
);

-- Enable RLS
ALTER TABLE public.booking_statuses ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view booking statuses for their accounts"
  ON public.booking_statuses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = booking_statuses.account_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert booking statuses for their accounts"
  ON public.booking_statuses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = booking_statuses.account_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update booking statuses for their accounts"
  ON public.booking_statuses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = booking_statuses.account_id
      AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete booking statuses for their accounts"
  ON public.booking_statuses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = booking_statuses.account_id
      AND a.user_id = auth.uid()
    )
  );

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_booking_statuses_account_hotel_booking_checkout 
  ON public.booking_statuses(account_id, hotel, booking_number, checkout_date);

-- Create trigger for updated_at
CREATE TRIGGER update_booking_statuses_updated_at
BEFORE UPDATE ON public.booking_statuses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
