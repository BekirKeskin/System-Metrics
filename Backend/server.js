/*          !!!   MODÜLLER   !!!          */

require("dotenv").config();
const http = require("node:http");
const { Server } = require("socket.io");

const handleAlarmRoutes = require("./routes/alarm-routes");
const handleUserRoutes = require("./routes/user-routes");
const handleAuthRoutes = require("./routes/auth-routes");
const handleMetricRoutes = require("./routes/metric-routes");

const verifyToken = require("./middleware/auth-middleware");
const agentAuthMiddleware = require("./middleware/agent-auth-middleware");

const handleAgentConnection = require("./socket/agent-handler");
const handleDashboardConnection = require("./socket/dashboard-handler");

const createWindowsMonitor = require("./services/windows-monitor-service");
const createServerListService = require("./services/server-list-service");

const publicRouteHandlers = [
    (req, res) => handleAuthRoutes(req, res, JWT_SECRET)
];

const protectedRouteHandlers = [
    handleUserRoutes,
    handleAlarmRoutes,
    handleMetricRoutes
];

/*          !!!   DEĞİŞKENLER   !!!         */

const JWT_SECRET = process.env.JWT_SECRET;
let isShuttingDown = false;

const accessRules = [
    {
        prefix: "/admin/",
        authorize: (req, res) => {

            const verifiedUser = verifyToken(req, res, JWT_SECRET);

            if (!verifiedUser) {
                return false;
            }

            if (verifiedUser.role !== "admin") {

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
    },

    {
        prefix: "/metrics/",
        authorize: (req, res) => {
            const verifiedUser = verifyToken(req, res, JWT_SECRET);

            return Boolean(verifiedUser);
        }
    }
];

/*          !!!   SERVER   !!!         */

const server = http.createServer(async (req, res) => {

    // cors yalnızca socket.io tarafını yönettiği için node:http ile yazılan
    // cevaplara otomatik uygulanmaz.
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:4200");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    for (const routeHandler of publicRouteHandlers) {
        if (await routeHandler(req, res)) {
            return;
        }
    }

    for (const accessRule of accessRules) {

        if (!req.url.startsWith(accessRule.prefix)) {
            continue;
        }

        const isAuthorized = accessRule.authorize(req, res);

        if (!isAuthorized) {
            return;
        }

        break;
    }

    for (const routeHandler of protectedRouteHandlers) {
        if (await routeHandler(req, res)) {
            return;
        }
    }

    res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("Server Çalışıyor!");
});

const io = new Server(server, {
    cors: {
        origin: "http://localhost:4200",
        methods: ["GET", "POST"]
    }
});

const serverListService = createServerListService(io);

const windowsMonitor = createWindowsMonitor(
    io,
    serverListService.emitServerList
);

io.use(agentAuthMiddleware);

/*          !!!   OLAY DİNLEYİCİLERİ   !!!         */

io.on("connection", async (socket) => {

    if (isShuttingDown) {
        socket.disconnect(true);
        return;
    }

    const clientType =
        socket.handshake.auth?.clientType ?? "dashboard";


    if (clientType === "agent") {

        handleAgentConnection(
            io,
            socket,
            serverListService.emitServerList
        );

        return;
    }

    await handleDashboardConnection(
        io,
        socket,
        windowsMonitor
    );
});

/*          !!!   WINDOWS MONITORING   !!!         */

windowsMonitor.start();

server.listen(3000, () => {
    console.log("Server çalışmaya başladı!");
});

serverListService.startBroadcasting();

/*          !!!   KAPATMA İŞLEMİ   !!!         */

process.on("SIGINT", () => {

    if (isShuttingDown) {
        return;
    }

    isShuttingDown = true;

    console.log(
        "\nKapatma işlemi başlatıldı... "
    );

    windowsMonitor.stop();
    serverListService.stopBroadcasting();

    io.close(() => {
        console.log("Server kapandı!");
    });
});