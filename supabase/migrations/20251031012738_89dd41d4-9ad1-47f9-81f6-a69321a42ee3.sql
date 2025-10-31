-- Add a policy to allow checking if a user is the master account
-- This allows the is_master_account function to work properly

CREATE POLICY "Allow checking master account status" 
ON profiles 
FOR SELECT 
USING (email = 'contact@gosgconsulting.com');