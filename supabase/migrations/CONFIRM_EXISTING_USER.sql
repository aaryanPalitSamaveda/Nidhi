-- Quick fix: Confirm the user that was already created
-- Replace 'USER_EMAIL_HERE' with the actual email of the user you created

UPDATE auth.users
SET 
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  confirmed_at = COALESCE(confirmed_at, NOW())
WHERE email = 'USER_EMAIL_HERE';

-- Verify it worked
SELECT 
  id,
  email,
  email_confirmed_at,
  confirmed_at,
  created_at
FROM auth.users
WHERE email = 'USER_EMAIL_HERE';

