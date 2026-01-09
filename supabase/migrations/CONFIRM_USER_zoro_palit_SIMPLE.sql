-- Confirm the user: zoro.palit.1971@gmail.com
-- Only update email_confirmed_at (confirmed_at is auto-generated)

UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'zoro.palit.1971@gmail.com'
  AND email_confirmed_at IS NULL;

