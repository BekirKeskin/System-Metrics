ALTER TABLE alarms
ADD COLUMN server_id INTEGER;

UPDATE alarms
SET server_id = (
    SELECT id
    FROM servers
    WHERE source_type = 'local'
    ORDER BY id
    LIMIT 1
)
WHERE server_id IS NULL;

ALTER TABLE alarms
ADD CONSTRAINT alarms_server_id_fkey
FOREIGN KEY (server_id)
REFERENCES servers(id);

ALTER TABLE alarms
ALTER COLUMN server_id SET NOT NULL;