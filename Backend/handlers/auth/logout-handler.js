const pool = require("../../db");

const {
    getCookie,
    hashRefreshToken,
    clearRefreshTokenCookie
} = require("../../services/auth/auth-token-service");

async function handleLogout(req, res) {

    const refreshToken = getCookie(req, "refreshToken");

    try {

        if (refreshToken) {

            const refreshTokenHash = hashRefreshToken(refreshToken);

            await pool.query(
                `
                UPDATE refresh_tokens
                SET revoked_at =
                    COALESCE(
                        revoked_at,
                        CURRENT_TIMESTAMP
                    )
                WHERE token_hash = $1
                `,
                [
                    refreshTokenHash
                ]
            );
        }

        clearRefreshTokenCookie(res);

        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            success: true,
            message: "Çıkış başarılı."
        }));
    }
    catch (error) {

        console.error("Logout hatası:", error);

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
}

module.exports = handleLogout;