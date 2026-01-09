-- Allow admins to insert profiles (for user creation)
-- This is needed when admins create users and need to set up their profiles

CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


