const handleCreateAlarm = require("../handlers/alarm/create-alarm-handler");
const handleGetAlarms = require("../handlers/alarm/get-alarms-handler");
const handleUpdateAlarm = require("../handlers/alarm/update-alarm-handler");
const handleDeleteAlarm = require("../handlers/alarm/delete-alarm-handler");

const routes = {

    GET: {
        "/admin/alarms": handleGetAlarms
    },

    POST: {
        "/admin/alarms": handleCreateAlarm
    }

};

const dynamicRoutes = {

    PUT: [
        {
            pattern: /^\/admin\/alarms\/(\d+)$/,

            handler: handleUpdateAlarm
        }
    ],

    DELETE: [
        {
            pattern: /^\/admin\/alarms\/(\d+)$/,

            handler: handleDeleteAlarm
        }
    ]

};


function findDynamicRoute(method, pathname) {

    const methodRoutes = dynamicRoutes[method];

    if (!methodRoutes) {
        return null;
    }

    for (const route of methodRoutes) {

        const match = pathname.match(route.pattern);

        if (!match) {
            continue;
        }

        return {
            handler: route.handler,

            params: {
                id: match[1]
            }
        };
    }

    return null;
}


async function handleAlarmRoutes(req, res) {

    const requestUrl = new URL(req.url, "http://localhost");
    const pathname = requestUrl.pathname;
    const staticHandler = routes[req.method]?.[pathname];

    if (staticHandler) {

        await staticHandler(req, res, requestUrl);

        return true;
    }

    const dynamicRoute = findDynamicRoute(req.method, pathname);

    if (dynamicRoute) {

        await dynamicRoute.handler(
            req,
            res,
            dynamicRoute.params,
            requestUrl
        );

        return true;
    }

    return false;
}

module.exports = handleAlarmRoutes;