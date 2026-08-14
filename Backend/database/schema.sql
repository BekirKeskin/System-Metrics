CREATE TABLE users (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    surname TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL
        CONSTRAINT users_role_check
        CHECK (role IN ('admin', 'user')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE servers (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    server_key VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    hostname VARCHAR(255) NOT NULL,
    os VARCHAR(50) NOT NULL,
    source_type VARCHAR(20) NOT NULL
        CONSTRAINT servers_source_type_check
        CHECK (source_type IN ('local', 'agent')),
    physical_core_count INTEGER,
    logical_processor_count INTEGER,
    total_mem_gb NUMERIC(10, 2),
    interface_name VARCHAR(255),
    interface_speed_mbps NUMERIC(12, 2),
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    agent_secret_hash VARCHAR(255)
);


CREATE TABLE alarms (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipient_user_id INTEGER NOT NULL,
    metric_type TEXT NOT NULL,
    threshold NUMERIC(5, 2) NOT NULL,
    severity TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    server_id INTEGER NOT NULL,

    CONSTRAINT alarms_recipient_user_id_fkey
        FOREIGN KEY (recipient_user_id)
        REFERENCES users(id),

    CONSTRAINT alarms_server_id_fkey
        FOREIGN KEY (server_id)
        REFERENCES servers(id)
);


CREATE TABLE metrics (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    server_id INTEGER NOT NULL,
    cpu_usage NUMERIC(5, 2),
    used_mem_gb NUMERIC(10, 2),
    free_mem_gb NUMERIC(10, 2),
    mem_usage NUMERIC(5, 2),
    disk_read_mbps NUMERIC(12, 2),
    disk_write_mbps NUMERIC(12, 2),
    received_mbps NUMERIC(12, 2),
    sent_mbps NUMERIC(12, 2),
    network_usage NUMERIC(8, 2),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT metrics_server_id_fkey
        FOREIGN KEY (server_id)
        REFERENCES servers(id)
        ON DELETE CASCADE
);

CREATE TABLE refresh_tokens (
    id BIGSERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    session_id UUID NOT NULL,

    token_hash CHAR(64) NOT NULL UNIQUE,

    expires_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ,

    replaced_by_token_hash CHAR(64),

    created_at TIMESTAMPTZ
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP
);