-- Allows phone+password login by looking up the auth email from the profiles table.
-- Called by the mobile app before signInWithPassword (before any session exists).
CREATE OR REPLACE FUNCTION public.get_email_by_phone(p_phone text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.email
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id
  WHERE REGEXP_REPLACE(p.phone, '[^0-9]', '', 'g') = REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO anon, authenticated;
