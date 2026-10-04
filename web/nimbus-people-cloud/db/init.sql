-- =====================================================================
--  NIMBUS People Cloud — schema + seed
--  Runs once on first boot (as the Postgres superuser defined by
--  POSTGRES_USER). Creates a LEAST-PRIVILEGE application role that the
--  GraphQL server uses at runtime. `docker compose down -v` drops the
--  volume so this script re-runs and the flag is re-seeded cleanly.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------
CREATE TABLE departments (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    cost_center TEXT NOT NULL
);

CREATE TABLE employees (
    id                SERIAL PRIMARY KEY,
    first_name        TEXT NOT NULL,
    last_name         TEXT NOT NULL,
    email             TEXT NOT NULL UNIQUE,
    title             TEXT NOT NULL,
    role              TEXT NOT NULL DEFAULT 'EMPLOYEE',  -- EMPLOYEE | MANAGER | ADMIN | EXECUTIVE
    department_id     INTEGER REFERENCES departments(id),
    manager_id        INTEGER REFERENCES employees(id),
    salary            INTEGER NOT NULL,
    leave_balance     NUMERIC(5,1) NOT NULL DEFAULT 20.0,
    location          TEXT NOT NULL,
    hired_at          DATE NOT NULL,
    password_hash     TEXT NOT NULL,          -- decoy loot (bcrypt)
    confidential_memo TEXT,                   -- decoy loot (HR notes)
    vault_secret      TEXT                    -- executive-only; holds the flag on the CEO
);

CREATE TABLE payslips (
    id            SERIAL PRIMARY KEY,
    employee_id   INTEGER NOT NULL REFERENCES employees(id),
    period        TEXT NOT NULL,              -- e.g. '2026-09'
    gross_cents   INTEGER NOT NULL,
    tax_cents     INTEGER NOT NULL,
    net_cents     INTEGER NOT NULL,
    issued_at     DATE NOT NULL
);

CREATE TABLE leave_requests (
    id          SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    kind        TEXT NOT NULL,                -- ANNUAL | SICK | UNPAID
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    days        NUMERIC(4,1) NOT NULL,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Seed: departments
-- ---------------------------------------------------------------------
INSERT INTO departments (id, name, cost_center) VALUES
  (1, 'Executive',          'CC-1000'),
  (2, 'Engineering',        'CC-2000'),
  (3, 'People & Culture',   'CC-3000'),
  (4, 'Finance',            'CC-4000'),
  (5, 'Sales',              'CC-5000'),
  (6, 'Customer Success',   'CC-6000');
SELECT setval('departments_id_seq', (SELECT MAX(id) FROM departments));

-- ---------------------------------------------------------------------
-- Seed: employees
--   * Regular password for every seeded staff member: Welcome123!
--   * Guest demo account (id 17): N1mbus@Guest2026
--   * The flag lives in employees.vault_secret for the CEO (id 1).
-- ---------------------------------------------------------------------
-- bcrypt('Welcome123!')
\set staff_hash '$2a$10$7PaOsWeQK73BxbTiOHE2Du/7x5Jrm3QAjF7l4W7Hs1.ypTn72azFy'
-- bcrypt('N1mbus@Guest2026')
\set guest_hash '$2a$10$WuZ/2MYbGRnPvtLThIzJCuaG.6NDd48N6TeJA5EdpkYyEKtqeaxTy'

INSERT INTO employees
  (id, first_name, last_name, email, title, role, department_id, manager_id, salary, leave_balance, location, hired_at, password_hash, confidential_memo, vault_secret)
VALUES
  (1,  'Margaret', 'Okafor',    'margaret.okafor@nimbus.example',  'Chief Executive Officer',        'EXECUTIVE', 1, NULL, 412000, 25.0, 'London',       '2016-02-01', :'staff_hash',
       'Board comp review scheduled Q1. Do not circulate.',
       'Securinets{br0k3n_0bj3ct_l3v3l_auth_v1a_gr4phql_1ntr0sp3ct10n}'),
  (2,  'Daniel',   'Reyes',     'daniel.reyes@nimbus.example',     'Chief Information Security Officer','EXECUTIVE', 2, 1, 298000, 18.5, 'Austin',      '2017-06-12', :'staff_hash',
       'Pending SOC2 Type II remediation items tracked in JIRA SEC-*',
       'ops-note: rotate staging AWS access keys before 2026-12-31'),
  (3,  'Priya',    'Nair',      'priya.nair@nimbus.example',       'VP Engineering',                 'MANAGER',   2, 1, 245000, 12.0, 'Bangalore',   '2017-09-03', :'staff_hash',
       'Flight-risk per last skip-level; counter-offer approved to 260k.', NULL),
  (4,  'Marcus',   'Lindqvist', 'marcus.lindqvist@nimbus.example', 'Staff Engineer',                 'EMPLOYEE',  2, 3, 198000, 9.5,  'Stockholm',   '2018-01-22', :'staff_hash', NULL, NULL),
  (5,  'Aisha',    'Benali',    'aisha.benali@nimbus.example',     'Senior Backend Engineer',        'EMPLOYEE',  2, 3, 172000, 14.0, 'Tunis',       '2019-03-14', :'staff_hash', NULL, NULL),
  (6,  'Tom',      'Fletcher',  'tom.fletcher@nimbus.example',     'Backend Engineer',               'EMPLOYEE',  2, 3, 141000, 16.0, 'Manchester',  '2021-07-01', :'staff_hash', NULL, NULL),
  (7,  'Elena',    'Rossi',     'elena.rossi@nimbus.example',      'Frontend Engineer',              'EMPLOYEE',  2, 3, 138000, 11.5, 'Milan',       '2021-11-09', :'staff_hash', NULL, NULL),
  (8,  'Gabriel',  'Mensah',    'gabriel.mensah@nimbus.example',   'VP People',                      'MANAGER',   3, 1, 231000, 20.0, 'Accra',       '2018-05-20', :'staff_hash',
       'Owns PIP for emp#12. Legal reviewed 2026-08.', NULL),
  (9,  'Sara',     'Haddad',    'sara.haddad@nimbus.example',      'People Operations Partner',      'EMPLOYEE',  3, 8, 124000, 22.0, 'Tunis',       '2020-02-17', :'staff_hash', NULL, NULL),
  (10, 'Lukas',    'Berger',    'lukas.berger@nimbus.example',     'Recruiter',                      'EMPLOYEE',  3, 8, 98000,  19.0, 'Berlin',      '2022-04-04', :'staff_hash', NULL, NULL),
  (11, 'Naomi',    'Clarke',    'naomi.clarke@nimbus.example',     'VP Finance',                     'MANAGER',   4, 1, 238000, 15.0, 'Dublin',      '2017-10-30', :'staff_hash',
       'Audit committee prep in progress.', NULL),
  (12, 'Owen',     'Dawson',    'owen.dawson@nimbus.example',      'Financial Analyst',              'EMPLOYEE',  4, 11, 112000, 8.0,  'Dublin',     '2021-01-18', :'staff_hash',
       'On performance improvement plan through 2026-11.', NULL),
  (13, 'Fatima',   'Zahra',     'fatima.zahra@nimbus.example',     'Payroll Specialist',             'EMPLOYEE',  4, 11, 101000, 17.5, 'Casablanca', '2020-09-28', :'staff_hash', NULL, NULL),
  (14, 'James',    'Whitfield', 'james.whitfield@nimbus.example',  'VP Sales',                       'MANAGER',   5, 1, 252000, 10.0, 'New York',    '2018-08-13', :'staff_hash', NULL, NULL),
  (15, 'Carla',    'Mendes',    'carla.mendes@nimbus.example',     'Account Executive',              'EMPLOYEE',  5, 14, 134000, 13.0, 'Lisbon',      '2021-03-22', :'staff_hash', NULL, NULL),
  (16, 'Victor',   'Nguyen',    'victor.nguyen@nimbus.example',    'Sales Development Rep',          'EMPLOYEE',  5, 14, 89000,  21.0, 'Singapore',   '2022-10-10', :'staff_hash', NULL, NULL),
  (17, 'Guest',    'Employee',  'guest.employee@nimbus.example',   'Customer Success Associate',     'EMPLOYEE',  6, 18, 86000,  23.5, 'Remote',      '2023-01-09', :'guest_hash',
       NULL, NULL),
  (18, 'Hannah',   'Schmidt',   'hannah.schmidt@nimbus.example',   'VP Customer Success',            'MANAGER',   6, 1, 221000, 16.5, 'Munich',      '2019-06-25', :'staff_hash', NULL, NULL),
  (19, 'Diego',    'Alvarez',   'diego.alvarez@nimbus.example',    'Customer Success Manager',       'EMPLOYEE',  6, 18, 128000, 12.5, 'Madrid',      '2021-05-11', :'staff_hash', NULL, NULL),
  (20, 'Yuki',     'Tanaka',    'yuki.tanaka@nimbus.example',      'Support Engineer',               'EMPLOYEE',  6, 18, 96000,  18.0, 'Tokyo',       '2022-02-28', :'staff_hash', NULL, NULL);
SELECT setval('employees_id_seq', (SELECT MAX(id) FROM employees));

-- ---------------------------------------------------------------------
-- Seed: payslips (last 3 months for everyone)
-- ---------------------------------------------------------------------
INSERT INTO payslips (employee_id, period, gross_cents, tax_cents, net_cents, issued_at)
SELECT e.id,
       p.period,
       (e.salary / 12) * 100                                   AS gross_cents,
       ((e.salary / 12) * 100 * 32 / 100)                      AS tax_cents,
       ((e.salary / 12) * 100) - ((e.salary / 12) * 100 * 32 / 100) AS net_cents,
       p.issued_at
FROM employees e
CROSS JOIN (VALUES
    ('2026-07', DATE '2026-07-28'),
    ('2026-08', DATE '2026-08-28'),
    ('2026-09', DATE '2026-09-28')
) AS p(period, issued_at);

-- ---------------------------------------------------------------------
-- Seed: a few leave requests for the guest and others
-- ---------------------------------------------------------------------
INSERT INTO leave_requests (employee_id, kind, start_date, end_date, days, status, reason) VALUES
  (17, 'ANNUAL', '2026-08-10', '2026-08-14', 5.0, 'APPROVED', 'Summer break'),
  (17, 'SICK',   '2026-09-02', '2026-09-02', 1.0, 'APPROVED', NULL),
  (5,  'ANNUAL', '2026-10-20', '2026-10-24', 5.0, 'PENDING',  'Family trip'),
  (12, 'UNPAID', '2026-11-03', '2026-11-07', 5.0, 'PENDING',  NULL);

-- =====================================================================
--  Least-privilege application role
--  The GraphQL server connects as nimbus_app, NOT as the superuser.
--  It can read everything and append leave requests — nothing else.
-- =====================================================================
CREATE ROLE nimbus_app WITH LOGIN PASSWORD 'app_only_readmostly_pw';

GRANT CONNECT ON DATABASE nimbus TO nimbus_app;
GRANT USAGE ON SCHEMA public TO nimbus_app;

-- read-mostly
GRANT SELECT ON ALL TABLES IN SCHEMA public TO nimbus_app;

-- the only write path the product needs: employees may file leave
GRANT INSERT ON leave_requests TO nimbus_app;
GRANT USAGE, SELECT ON SEQUENCE leave_requests_id_seq TO nimbus_app;

-- explicitly NO update/delete, NO ddl, NO superuser, NO access to other roles.
REVOKE ALL ON SEQUENCE employees_id_seq, departments_id_seq, payslips_id_seq FROM nimbus_app;
