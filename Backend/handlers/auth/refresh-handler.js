const pool = require("../../db");

const {
    createAccessToken,
    createRefreshToken,
    hashRefreshToken,
    createRefreshTokenExpirationDate,
    getCookie,
    setRefreshTokenCookie,
    clearRefreshTokenCookie
} = require("../../services/auth/auth-token-service");

async function handleRefresh(req, res, jwtSecret) {

    const refreshToken = getCookie(req, "refreshToken");

    if (!refreshToken) {

        res.writeHead(401, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            success: false,
            message: "Refresh token bulunamadı."
        }));
        return;
    }

    const refreshTokenHash = hashRefreshToken(refreshToken);
    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        const tokenResult = await client.query(
            `
            SELECT
                rt.id,
                rt.user_id,
                rt.session_id,
                rt.token_hash,
                rt.expires_at,
                rt.revoked_at,
                u.username,
                u.role,
                u.is_active
            FROM refresh_tokens rt
            INNER JOIN users u
                ON rt.user_id = u.id
            WHERE rt.token_hash = $1
            FOR UPDATE
            `,
            [
                refreshTokenHash
            ]
        );

        if (tokenResult.rows.length === 0) {

            await client.query(
                "ROLLBACK"
            );

            clearRefreshTokenCookie(res);

            res.writeHead(401, {
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: false,
                message: "Refresh token geçersiz."
            }));
            return;
        }

        const storedToken = tokenResult.rows[0];

        if (storedToken.revoked_at) {

            await client.query(
                `
                UPDATE refresh_tokens
                SET revoked_at =
                    COALESCE(
                        revoked_at,
                        CURRENT_TIMESTAMP
                    )
                WHERE session_id = $1
                AND revoked_at IS NULL
                `,
                [
                    storedToken.session_id
                ]
            );

            await client.query(
                "COMMIT"
            );

            clearRefreshTokenCookie(res);

            res.writeHead(401, {
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: false,
                message: "Refresh token tekrar kullanılmış veya iptal edilmiş."
            }));
            return;
        }

        if (new Date(storedToken.expires_at).getTime() <= Date.now()) {

            await client.query(
                `
                UPDATE refresh_tokens
                SET revoked_at =
                    CURRENT_TIMESTAMP
                WHERE id = $1
                `,
                [
                    storedToken.id
                ]
            );

            await client.query(
                "COMMIT"
            );

            clearRefreshTokenCookie(res);

            res.writeHead(401, {
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: false,
                message: "Refresh token süresi dolmuş."
            }));
            return;
        }

        if (!storedToken.is_active) {

            await client.query(
                `
                UPDATE refresh_tokens
                SET revoked_at =
                    COALESCE(
                        revoked_at,
                        CURRENT_TIMESTAMP
                    )
                WHERE session_id = $1
                AND revoked_at IS NULL
                `,
                [
                    storedToken.session_id
                ]
            );

            await client.query(
                "COMMIT"
            );

            clearRefreshTokenCookie(res);

            res.writeHead(401, {
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: false,
                message: "Kullanıcı hesabı pasif."
            }));
            return;
        }

        const newRefreshToken = createRefreshToken();
        const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
        const newExpiresAt = createRefreshTokenExpirationDate();


        await client.query(
            `
            UPDATE refresh_tokens
            SET
                revoked_at =
                    CURRENT_TIMESTAMP,
                replaced_by_token_hash =
                    $1
            WHERE id = $2
            `,
            [
                newRefreshTokenHash,
                storedToken.id
            ]
        );

        await client.query(
            `
            INSERT INTO refresh_tokens (
                user_id,
                session_id,
                token_hash,
                expires_at
            )
            VALUES ($1, $2, $3, $4)
            `,
            [
                storedToken.user_id,
                storedToken.session_id,
                newRefreshTokenHash,
                newExpiresAt
            ]
        );

        const accessToken = createAccessToken(
            {
                id: storedToken.user_id,
                username: storedToken.username,
                role: storedToken.role
            },
            jwtSecret
        );

        await client.query(
            "COMMIT"
        );

        setRefreshTokenCookie(
            res,
            newRefreshToken
        );

        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            success: true,
            message: "Access token yenilendi.",
            token: accessToken
        }));
    }
    catch (error) {

        try {
            await client.query(
                "ROLLBACK"
            );
        }
        catch (rollbackError) {
            console.error("Refresh rollback hatası:", rollbackError);
        }

        console.error("Refresh token hatası:", error);

        if (!res.headersSent) {

            res.writeHead(500, {
                "Content-Type": "application/json; charset=utf-8"
            });
        }

        res.end(JSON.stringify({
            success: false,
            message: "Sunucu hatası oluştu."
        }));
    }
    finally {
        client.release();
    }
}

module.exports = handleRefresh;