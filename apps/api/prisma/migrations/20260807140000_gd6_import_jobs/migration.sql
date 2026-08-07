-- GĐ6 — import theo batch + checkpoint + resume (§4.7, #27)

CREATE TABLE import_jobs (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL,
  created_by_id      uuid,
  updated_by_id      uuid,
  tenant_id          uuid        NOT NULL,
  entity             text        NOT NULL,
  file_id            uuid,
  status             text        NOT NULL DEFAULT 'PENDING',
  template_version   text        NOT NULL DEFAULT 'v1',
  mode               text        NOT NULL DEFAULT 'partial-success',
  on_duplicate       text        NOT NULL DEFAULT 'skip',
  total_rows         integer     NOT NULL DEFAULT 0,
  valid_rows         integer     NOT NULL DEFAULT 0,
  error_rows         integer     NOT NULL DEFAULT 0,
  last_processed_row integer     NOT NULL DEFAULT 0,
  mapping            jsonb,
  CONSTRAINT import_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT import_jobs_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE TABLE import_rows (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL,
  created_by_id uuid,
  updated_by_id uuid,
  tenant_id     uuid        NOT NULL,
  job_id        uuid        NOT NULL,
  row_number    integer     NOT NULL,
  raw           jsonb       NOT NULL,
  errors        jsonb,
  status        text        NOT NULL DEFAULT 'PENDING',
  CONSTRAINT import_rows_pkey PRIMARY KEY (id),
  CONSTRAINT import_rows_job_row_key UNIQUE (tenant_id, job_id, row_number),
  CONSTRAINT import_rows_job_fk
    FOREIGN KEY (tenant_id, job_id) REFERENCES import_jobs (tenant_id, id) ON DELETE CASCADE
);
