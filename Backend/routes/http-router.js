const verifyToken = require("../middleware/auth-middleware");

const authRoutes = require("./auth-routes");
const userRoutes = require("./user-routes");
const alarmRoutes = require("./alarm-routes");
const metricRoutes = require("./metric-routes");

const routes = [

    {
        method: "GET",
        path: "/",
        access: "public",

        handler: (req, res) => {

            res.writeHead(200, {
                "Content-Type": "text/plain; charset=utf-8"
            });

            res.end("Server Çalışıyor!");
        }
    },

    ...authRoutes,
    ...userRoutes,
    ...alarmRoutes,
    ...metricRoutes
];

function authorizeRoute(req, res, access, jwtSecret) {

    if (access === "public") {
        return true;
    }

    const verifiedUser = verifyToken(req, res, jwtSecret);

    if (!verifiedUser) {
        return false;
    }

    if (access === "admin" && verifiedUser.role !== "admin") {

        res.writeHead(403, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            success: false,
            message: "Bu işlem için admin yetkisi gerekiyor."
        }));

        return false;
    }

    return true;
}

async function handleHttpRoute(req, res, jwtSecret) {

    const requestUrl = new URL(req.url, "http://localhost");

    const pathname = requestUrl.pathname;

    let matchedRoute = null;
    let routeMatch = null;

    for (const route of routes) {

        if (route.method !== req.method) {
            continue;
        }

        if (typeof route.path === "string") {

            if (route.path !== pathname) {
                continue;
            }

            matchedRoute = route;
            break;
        }

        if (route.path instanceof RegExp) {

            const match = pathname.match(route.path);

            if (!match) {
                continue;
            }

            matchedRoute = route;
            routeMatch = match;

            break;
        }
    }

    if (!matchedRoute) {
        return false;
    }

    const isAuthorized = authorizeRoute(req, res, matchedRoute.access, jwtSecret);

    if (!isAuthorized) {
        return true;
    }

    const params = matchedRoute.getParams && routeMatch ? matchedRoute.getParams(routeMatch) : {};

    const context = {requestUrl, params, jwtSecret};

    await matchedRoute.handler(req, res, context);

    return true;
}

module.exports = handleHttpRoute;