-- 0017_contact_id.sql

ALTER TABLE calls ADD COLUMN contact_id TEXT;

UPDATE calls
SET contact_id = CASE
  WHEN pickup_notes LIKE '%Contact ID:%' THEN
    CASE
      WHEN instr(substr(pickup_notes, instr(pickup_notes, 'Contact ID:') + 11), '|') > 0 THEN
        trim(
          substr(
            substr(pickup_notes, instr(pickup_notes, 'Contact ID:') + 11),
            1,
            instr(substr(pickup_notes, instr(pickup_notes, 'Contact ID:') + 11), '|') - 1
          )
        )
      ELSE trim(substr(pickup_notes, instr(pickup_notes, 'Contact ID:') + 11))
    END
  ELSE contact_id
END
WHERE pickup_notes IS NOT NULL;
