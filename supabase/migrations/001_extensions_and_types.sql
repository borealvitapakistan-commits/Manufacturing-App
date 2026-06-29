-- ============================================================================
-- 001_extensions_and_types.sql
-- Extensions and enum types.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  CREATE TYPE dosage_form AS ENUM (
    'capsule',
    'tablet',
    'softgel',
    'lozenge',
    'oil',
    'liquid',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE batch_status AS ENUM (
    'mixingPending',
    'ngpPending',
    'assemblyPending',
    'finalized'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE pay_type AS ENUM ('monthly', 'hourly', 'perTask');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE expense_direction AS ENUM ('debit', 'credit');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE fg_category AS ENUM ('powder', 'capsule', 'bottle');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE fg_change_source AS ENUM ('auto', 'manual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
