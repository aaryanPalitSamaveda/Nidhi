-- Confirm the user: zoro.palit.1971@gmail.com
-- This will allow them to log in immediately
-- Note: confirmed_at is a generated column, so we only update email_confirmed_at
UPDATE auth.users
SET 
  email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email = 'zoro.palit.1971@gmail.com';

-- Verify it worked
SELECT 
  id,
  email,
  email_confirmed_at,
  confirmed_at,
  created_at
FROM auth.users
WHERE email = 'zoro.palit.1971@gmail.com';

