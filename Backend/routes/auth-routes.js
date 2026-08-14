const handleLogin = require("../handlers/auth/login-handler");
const handleRefresh = require("../handlers/auth/refresh-handler");
const handleLogout = require("../handlers/auth/logout-handler");

const authRoutes = [
    {
        method: "POST",
        path: "/login",
        access: "public",

        handler: (req, res, context) => handleLogin(req, res, context.jwtSecret)
    },

    {
        method: "POST",
        path: "/refresh",
        access: "public",

        handler: (req, res, context) => handleRefresh(req, res, context.jwtSecret)
    },

    {
        method: "POST",
        path: "/logout",
        access: "public",

        handler: (req, res, context) => handleLogout(req, res, context.jwtSecret)
    }
];

module.exports = authRoutes;