-- =============================================================================
--  VANTAGE Procurement Cloud — database bootstrap
--  (CTF challenge: deliberately vulnerable. Do NOT model real code on this.)
-- =============================================================================
--  This script runs automatically on first container start via the official
--  postgres image entrypoint (/docker-entrypoint-initdb.d).
-- =============================================================================

SET client_min_messages TO WARNING;

-- -----------------------------------------------------------------------------
--  Catalog: the publicly browsable product inventory
-- -----------------------------------------------------------------------------
CREATE TABLE products (
    id            SERIAL PRIMARY KEY,
    product_code  TEXT        NOT NULL UNIQUE,
    name          TEXT        NOT NULL,
    description   TEXT        NOT NULL,
    category      TEXT        NOT NULL,
    vendor        TEXT        NOT NULL,
    price_usd     NUMERIC(10,2) NOT NULL,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE
);

INSERT INTO products (product_code, name, description, category, vendor, price_usd, is_active) VALUES
('VX-SRV-7100', 'Vantage R710 Rack Server',        '2U dual-socket rack server, 1TB DDR5, redundant PSU.',              'Servers',      'Vantage Systems',   8420.00, TRUE),
('VX-SRV-4420', 'Vantage R442 Edge Node',          'Compact 1U edge compute node for branch deployments.',             'Servers',      'Vantage Systems',   3190.00, TRUE),
('VX-NET-3200', 'Aperture 32-Port L3 Switch',      '32x25GbE managed layer-3 switch with hot-swap fans.',              'Networking',   'Aperture Networks', 5740.00, TRUE),
('VX-NET-0890', 'Aperture Border Firewall 890',    'Next-gen firewall appliance, 40Gbps inspection throughput.',       'Networking',   'Aperture Networks', 9950.00, TRUE),
('VX-STO-5500', 'Monolith AF550 All-Flash Array',  'All-flash SAN array, 100TB usable, NVMe-oF ready.',                'Storage',      'Monolith Data',    24800.00, TRUE),
('VX-STO-1200', 'Monolith Backup Vault 1200',      'Immutable backup appliance with air-gap scheduling.',              'Storage',      'Monolith Data',    11300.00, TRUE),
('VX-LIC-CLD1', 'Vantage Cloud Control — Standard','Per-node annual license for the Vantage control plane.',           'Licensing',    'Vantage Systems',   1200.00, TRUE),
('VX-LIC-CLD3', 'Vantage Cloud Control — Enterprise','Unlimited-node annual license with 24/7 SLA.',                   'Licensing',    'Vantage Systems',  14500.00, TRUE),
('VX-SEC-2040', 'Sentinel Endpoint Suite',         'Managed EDR/XDR endpoint protection, per-seat.',                   'Security',     'Sentinel Labs',       89.00, TRUE),
('VX-SEC-6610', 'Sentinel Threat Intel Feed',      'Curated IOC and threat-intelligence feed, annual.',                'Security',     'Sentinel Labs',     6400.00, TRUE),
('VX-PWR-0300', 'GridLine 3kVA Smart UPS',         'Rack-mount UPS, network card, pure sine-wave output.',             'Power',        'GridLine Power',    1890.00, TRUE),
('VX-PWR-0100', 'GridLine PDU Metered 42',         'Zero-U metered PDU, 42 outlets, remote cutoff.',                   'Power',        'GridLine Power',     760.00, TRUE),
('VX-SRV-9900', 'Vantage R990 AI Training Node',   '8x accelerator GPU server for model training workloads.',          'Servers',      'Vantage Systems',  61200.00, TRUE),
('VX-NET-7777', 'Aperture Optical Transceiver Kit','QSFP28 100G transceiver pack (10 units).',                         'Networking',   'Aperture Networks',  2300.00, TRUE),
-- discontinued / unlisted line items (is_active = FALSE): used to prove the trailing filter matters
('VX-OLD-0001', 'Vantage R610 (EOL)',              'End-of-life, retained for warranty records only.',                 'Servers',      'Vantage Systems',   1500.00, FALSE),
('VX-OLD-0002', 'Aperture 8-Port Switch (EOL)',    'End-of-life, no longer sold.',                                     'Networking',   'Aperture Networks',  400.00, FALSE);

-- -----------------------------------------------------------------------------
--  Staff accounts (realistic "loot" to enumerate before finding the real flag)
--  Hashes are bcrypt of throwaway values — not the objective.
-- -----------------------------------------------------------------------------
CREATE TABLE employees (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL,
    role          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    email         TEXT NOT NULL
);

INSERT INTO employees (username, full_name, role, password_hash, email) VALUES
('a.rahman',  'Amal Rahman',    'Procurement Lead',  '$2b$12$Qw9Zc1m0bK2u7nE3sJvN8e8hP4yR6tL0aX2cV1bN3mQ7wE5rT9uO2', 'a.rahman@vantage-cloud.example'),
('t.kessler', 'Tomas Kessler',  'Finance Approver',  '$2b$12$Lm4Kd8vP2qR6sT1uW3xY5e7fH9jK0lN2oP4qS6tU8vW0xZ2bC4dE6', 't.kessler@vantage-cloud.example'),
('s.okafor',  'Sade Okafor',    'Platform Admin',    '$2b$12$Zx1Cv3bN5mA7sD9fG2hJ4e6kL8nP0qR2tU4wX6yZ8aB0cD2eF4gH6', 's.okafor@vantage-cloud.example'),
('j.venn',    'Jiro Venn',      'Account Manager',   '$2b$12$Bn2Mc4vX6zA8sD0fG3hJ5e7kL9nP1qR3tU5wX7yZ9aB1cD3eF5gH7', 'j.venn@vantage-cloud.example');

-- -----------------------------------------------------------------------------
--  The objective. A locked-down internal table the catalog never references.
--  Reachable only by enumerating the schema and UNION-pulling it out.
-- -----------------------------------------------------------------------------
CREATE TABLE vault_secrets (
    id            SERIAL PRIMARY KEY,
    key_name      TEXT NOT NULL,
    secret_value  TEXT NOT NULL,
    rotated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO vault_secrets (key_name, secret_value) VALUES
('deploy_token',     'vx_deploy_a1f9c0e2-not-the-flag'),
('smtp_relay_pass',  'R3lay!decoy-not-the-flag'),
('ctf_flag',         'Securinets{un10n_h4rv3st_fr0m_th3_p0stgr3s_v4ult}');

-- -----------------------------------------------------------------------------
--  Least-privilege application role.
--  The web app connects as this role, NOT as the postgres superuser.
--  It can read the catalog tables but cannot write or escalate — so a solver
--  cannot simply DROP or UPDATE their way around the challenge, and stacked
--  queries buy them nothing. UNION read-out is the intended path.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vantage_app') THEN
        CREATE ROLE vantage_app LOGIN PASSWORD 'app_only_readonly_pw';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE vantage TO vantage_app;
GRANT USAGE ON SCHEMA public TO vantage_app;
GRANT SELECT ON products, employees, vault_secrets TO vantage_app;
-- No INSERT/UPDATE/DELETE, no sequence usage, no DDL for the app role.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM vantage_app;
