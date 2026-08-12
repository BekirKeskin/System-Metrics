const {
    getServerList
} = require("./server-service");

function createServerListService(io) {

    let serverListInterval = null;

    async function emitServerList() {

        try {
            const servers =
                await getServerList();

            io.emit(
                "serverList",
                servers
            );
        }
        catch (error) {
            console.error(
                "Server listesi yayınlama hatası:",
                error.message
            );
        }
    }

    function startBroadcasting() {

        if (serverListInterval) {
            clearInterval(
                serverListInterval
            );
        }

        serverListInterval =
            setInterval(
                emitServerList,
                5000
            );
    }

    function stopBroadcasting() {

        if (!serverListInterval) {
            return;
        }

        clearInterval(
            serverListInterval
        );

        serverListInterval = null;
    }

    return {
        emitServerList,
        startBroadcasting,
        stopBroadcasting
    };
}

module.exports =
    createServerListService;