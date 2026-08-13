const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");

const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function createAccessToken(user, jwtSecret) {

    return jwt.sign(
        {
            userId: user.id,
            username: user.username,
            role: user.role
        },
        jwtSecret,
        {
            expiresIn: ACCESS_TOKEN_EXPIRES_IN
        }
    );
}

function createRefreshToken() {

    return crypto
        .randomBytes(64)
        .toString("hex");
}

function hashRefreshToken(refreshToken) {

    return crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");
}

function createSessionId() {

    return crypto.randomUUID();
}

function createRefreshTokenExpirationDate() {

    return new Date(
        Date.now() +
        REFRESH_TOKEN_DURATION_MS
    );
}

function getCookie(req, cookieName) {

    const cookieHeader = req.headers.cookie;

    if (!cookieHeader) {
        return null;
    }

    const cookies = cookieHeader.split(";");

    for (const cookie of cookies) {

        const separatorIndex =
            cookie.indexOf("=");

        if (separatorIndex === -1) {
            continue;
        }

        const name = cookie
            .slice(0, separatorIndex)
            .trim();

        const value = cookie
            .slice(separatorIndex + 1)
            .trim();

        if (name === cookieName) {
            return value;
        }
    }
    return null;
}

function setRefreshTokenCookie(
    res,
    refreshToken
) {

    const cookieParts = [
        `refreshToken=${refreshToken}`,
        "HttpOnly",
        "SameSite=Strict",
        "Path=/",
        `Max-Age=${Math.floor(
            REFRESH_TOKEN_DURATION_MS / 1000
        )}`
    ];

    if (
        process.env.NODE_ENV === "production"
    ) {
        cookieParts.push("Secure");
    }

    res.setHeader(
        "Set-Cookie",
        cookieParts.join("; ")
    );
}

function clearRefreshTokenCookie(res) {

    const cookieParts = [
        "refreshToken=",
        "HttpOnly",
        "SameSite=Strict",
        "Path=/",
        "Max-Age=0"
    ];

    if (
        process.env.NODE_ENV === "production"
    ) {
        cookieParts.push("Secure");
    }

    res.setHeader(
        "Set-Cookie",
        cookieParts.join("; ")
    );
}

module.exports = {
    createAccessToken,
    createRefreshToken,
    hashRefreshToken,
    createSessionId,
    createRefreshTokenExpirationDate,
    getCookie,
    setRefreshTokenCookie,
    clearRefreshTokenCookie
};