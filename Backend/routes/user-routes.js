const handleCreateUser = require("../handlers/user/create-user-handler");
const handleGetUsers = require("../handlers/user/get-users-handler");

const userRoutes = [
    {
        method: "GET",
        path: "/admin/users",
        access: "admin",

        handler: (req, res, context) => handleGetUsers(req, res, context.requestUrl)
    },

    {
        method: "POST",
        path: "/admin/users",
        access: "admin",

        handler: (req, res, context) => handleCreateUser(req, res, context.requestUrl)
    }
];

module.exports = userRoutes;