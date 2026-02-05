-- Confirm emails for specific users
-- This allows users to login without email confirmation
-- Run this in Supabase SQL Editor

-- Confirm email for aaryanpalit@gmail.com
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'aaryanpalit@gmail.com'
  AND email_confirmed_at IS NULL;

-- Confirm email for ayush@samavedacapital.com
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'ayush@samavedacapital.com'
  AND email_confirmed_at IS NULL;

-- Verify the updates
SELECT 
  email,
  email_confirmed_at,
  CASE 
    WHEN email_confirmed_at IS NULL THEN '❌ NOT CONFIRMED'
    ELSE '✅ CONFIRMED'
  END as status
FROM auth.users
WHERE email IN ('aaryanpalit@gmail.com', 'ayush@samavedacapital.com')
ORDER BY email;



