const handleCreateUser = require("../handlers/user/create-user-handler");
const handleGetUsers = require("../handlers/user/get-users-handler");

const routes = {

    GET: {
        "/admin/users": handleGetUsers
    },

    POST: {
        "/admin/users": handleCreateUser
    }

};

async function handleUserRoutes(req, res) {

    const requestUrl = new URL(req.url, "http://localhost");
    const pathname = requestUrl.pathname;
    const handler = routes[req.method]?.[pathname];

    if (!handler) {
        return false;
    }

    await handler(req, res, requestUrl);

    return true;
}

module.exports = handleUserRoutes;