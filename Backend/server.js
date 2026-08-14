/*          !!!   MODÜLLER   !!!          */

require("dotenv").config();
const http = require("node:http");
const { Server } = require("socket.io");

const handleHttpRoute = require("./routes/http-router");

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
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:4200");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    if (await handleHttpRoute(req, res, JWT_SECRET)) {
        return;
    }

    res.writeHead(404, {
        "Content-Type": "application/json; charset=utf-8"
    });

    res.end(JSON.stringify({
        success: false,
        message: "Endpoint bulunamadı."
    }));
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

    const clientType = socket.handshake.auth?.clientType ?? "dashboard";

    if (clientType === "agent") {

        handleAgentConnection(
            io,
            socket,
            serverListService.emitServerList
        );

        return;
    }

    await handleDashboardConnection(io, socket, windowsMonitor);
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

    console.log("\nKapatma işlemi başlatıldı... ");

    windowsMonitor.stop();
    serverListService.stopBroadcasting();

    io.close(() => {
        console.log("Server kapandı!");
    });
});