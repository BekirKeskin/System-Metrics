const { createHash, timingSafeEqual } = require("node:crypto");
const pool = require("../db");

async function agentAuthMiddleware(socket, next) {

    const {
        clientType,
        serverKey,
        agentSecret
    } = socket.handshake.auth ?? {};

    // Angular/dashboard bağlantısıysa
    // agent authentication uygulanmaz.
    if (clientType !== "agent") {
        return next();
    }

    if (!serverKey || !agentSecret) {
        console.log(
            "Agent authentication reddedildi: eksik bilgi."
        );

        return next(
            new Error("Agent authentication failed.")
        );
    }

    try {
        const result = await pool.query(
            `
            SELECT
                id,
                agent_secret_hash
            FROM servers
            WHERE server_key = $1
              AND source_type = 'agent'
            LIMIT 1
            `,
            [serverKey]
        );

        if (result.rows.length === 0) {
            console.log(
                "Agent authentication reddedildi: kayıtlı agent yok."
            );

            return next(
                new Error("Agent authentication failed.")
            );
        }

        const server = result.rows[0];

        if (!server.agent_secret_hash) {
            console.log(
                "Agent authentication reddedildi: secret hash yok."
            );

            return next(
                new Error("Agent authentication failed.")
            );
        }

        const receivedHash =
            createHash("sha256")
                .update(agentSecret)
                .digest();

        const storedHash =
            Buffer.from(
                server.agent_secret_hash,
                "hex"
            );

        if (
            receivedHash.length !== storedHash.length ||
            !timingSafeEqual(
                receivedHash,
                storedHash
            )
        ) {
            console.log(
                "Agent authentication reddedildi: secret yanlış."
            );

            return next(
                new Error("Agent authentication failed.")
            );
        }

        socket.data.serverId = server.id;

        console.log(
            `Agent authentication başarılı. serverId: ${server.id}`
        );

        return next();
    }
    catch (error) {
        console.error(
            "Agent authentication hatası:",
            error.message
        );

        return next(
            new Error("Agent authentication failed.")
        );
    }
}

module.exports = agentAuthMiddleware;