-- Extension bắt buộc theo spec: ltree (§4.4 cây đơn vị), pg_trgm (§3.5 tìm không dấu)
-- KHÔNG cài unaccent — spec §3.10 đã chốt chuẩn hoá ở tầng ứng dụng.
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
