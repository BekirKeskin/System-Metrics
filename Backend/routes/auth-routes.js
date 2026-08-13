const handleLogin = require("../handlers/auth/login-handler");
const handleRefresh = require("../handlers/auth/refresh-handler");
const handleLogout = require("../handlers/auth/logout-handler");

const routes = {

    POST: {
        "/login":handleLogin,
        "/refresh":handleRefresh,
        "/logout": handleLogout
    }

};

async function handleAuthRoutes(req, res, jwtSecret) {
    const requestUrl = new URL(req.url, "http://localhost");
    const pathname = requestUrl.pathname;
    const handler = routes[req.method]?.[pathname];

    if (!handler) {
        return false;
    }

    await handler(req, res, jwtSecret);

    return true;
}

module.exports = handleAuthRoutes;