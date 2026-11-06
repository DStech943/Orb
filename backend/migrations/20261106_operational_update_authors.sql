-- Makes the Operations history auditable for workspaces that applied the
-- original operational-updates migration before the submitter snapshot existed.
ALTER TABLE cx_copilot.orb_operational_updates
  ADD COLUMN IF NOT EXISTS submitted_by_name text;
