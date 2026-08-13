/*          !!!   MODÜLLER   !!!          */

require("dotenv").config();
const http = require("node:http");
const { Server } = require("socket.io");

const handleAlarmRoutes = require("./routes/alarm-routes");
const handleUserRoutes = require("./routes/user-routes");
const handleLoginRoutes = require("./routes/auth-routes");
const handleMetricRoutes = require("./routes/metric-routes");

const verifyToken = require("./middleware/auth-middleware");
const agentAuthMiddleware = require("./middleware/agent-auth-middleware");

const handleAgentConnection = require("./socket/agent-handler");
const handleDashboardConnection = require("./socket/dashboard-handler");

const createWindowsMonitor = require("./services/windows-monitor-service");
const createServerListService = require("./services/server-list-service");

/*          !!!   DEĞİŞKENLER   !!!         */

const JWT_SECRET = process.env.JWT_SECRET;
let isShuttingDown = false;

/*          !!!   SERVER   !!!         */

const server = http.createServer(async (req, res) => {

    // cors yalnızca socket.io tarafını yönettiği için node:http ile yazılan
    // cevaplara otomatik uygulanmaz.
    res.setHeader(
        "Access-Control-Allow-Origin",
        "http://localhost:4200"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    if (await handleLoginRoutes(req, res, JWT_SECRET)) {
        return;
    }

    if (req.url.startsWith("/admin/")) {

        const verifiedUser = verifyToken(
            req,
            res,
            JWT_SECRET
        );

        if (!verifiedUser) {
            return;
        }

        if (verifiedUser.role !== "admin") {
            res.writeHead(403, {
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: false,
                message: "Bu işlem için admin yetkisi gerekiyor."
            }));

            return;
        }
    }

    if (req.url.startsWith("/metrics/")) {

        const verifiedUser = verifyToken(
            req,
            res,
            JWT_SECRET
        );

        if (!verifiedUser) {
            return;
        }
    }

    if (await handleUserRoutes(req, res)) {
        return;
    }

    if (await handleAlarmRoutes(req, res)) {
        return;
    }

    if (await handleMetricRoutes(req, res)) {
        return;
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