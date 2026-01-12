-- STEP 1: Add new enum values
-- Run this FIRST, then run UPDATE_ROLES_TO_SELLER_INVESTOR_STEP2.sql

-- Add 'seller' to enum
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'seller' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE app_role ADD VALUE 'seller';
    RAISE NOTICE 'Added "seller" to app_role enum';
  ELSE
    RAISE NOTICE '"seller" already exists in app_role enum';
  END IF;
END $$;

-- Add 'investor' to enum
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'investor' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE app_role ADD VALUE 'investor';
    RAISE NOTICE 'Added "investor" to app_role enum';
  ELSE
    RAISE NOTICE '"investor" already exists in app_role enum';
  END IF;
END $$;



