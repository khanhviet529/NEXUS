-- GĐ3: cột nhạy cảm cho field-level permission (§4.4c, permission-matrix §4)
-- phone → group contact · national_id → pii · salary → hr
ALTER TABLE users
  ADD COLUMN phone       text,
  ADD COLUMN national_id text,
  ADD COLUMN salary      decimal(18,2);
