const pool = require("../db");

async function handleAlarmRoutes(req, res) {
    
    if(req.method === "POST" && req.url === "/admin/alarms") {
        
        console.log("Alarm ekleme isteği geldi.");
        let body = "";
    
        req.on("data",(chunk)=>{ //chunk isteğin gelen bir parçası  ilk hali Buffer olabilir
            body += chunk.toString();
        });

        req.on("end", async ()=>{

            try {
                const addAlarm = JSON.parse(body);
                const recipientUserId = addAlarm.recipientUserId;
                const metricType = addAlarm.metricType;
                const threshold = addAlarm.threshold;
                const severity = addAlarm.severity;

                if (!recipientUserId || !metricType || threshold === null || threshold === undefined || !severity) {

                    res.writeHead(400,{
                        "Content-Type": "application/json; charset=utf-8"
                    });
                    
                    res.end(JSON.stringify({
                        success: false,
                        message: "Tüm alanları giriniz !!!"
                    }));
                    return;
                }

                const result = await pool.query(
                    `INSERT INTO alarms (
                    recipient_user_id,
                    metric_type,
                    threshold,
                    severity
                    )
                    VALUES ($1, $2, $3, $4)
                    RETURNING id, recipient_user_id, metric_type, threshold, severity, is_active, created_at`,
                    [
                        recipientUserId,
                        metricType,
                        threshold,
                        severity
                    ]
                );
                console.log(result.rows[0]);

                res.writeHead(201, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: true,
                    message: "Alarm başarıyla oluşturuldu.",
                    alarm: result.rows[0]
                }));
            }
            catch (error) {
                console.error("Alarm Ekleme hatası:", error);

                if (!res.headersSent) {
                    res.writeHead(500, {
                        "Content-Type": "application/json; charset=utf-8"
                    });
                }

                res.end(JSON.stringify({
                    success: false,
                    message: "Sunucu hatası oluştu"
                }));
            }
        });
        return true;
    }

    if(req.method === "GET" && req.url === "/admin/alarms") {

        try {

            const result = await pool.query(
                `SELECT 
                    alarms.id, alarms.recipient_user_id, users.username, users.name, users.surname, alarms.metric_type,
                    alarms.threshold, alarms.severity, alarms.is_active, alarms.created_at
                FROM alarms
                INNER JOIN users
                    ON alarms.recipient_user_id = users.id
                ORDER BY alarms.created_at DESC`
            );

            res.writeHead(200,{
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: true,
                message: "Değerler getirildi.",
                alarms: result.rows
            }));
        }
        catch (error) {
            console.error("Değerler getirilemedi !!!", error);

            if (!res.headersSent) {
                res.writeHead(500, {
                    "Content-Type": "application/json; charset=utf-8"
                });
            }

            res.end(JSON.stringify({
                success: false,
                message: "Sunucu hatası oluştu"
            }));
        }
        return true;
    }

    if (req.method === "PUT" && req.url.startsWith("/admin/alarms/")) {

        // id yi çıkarmaya yarıyor split ("/") sonrası ["", "admin", "alarms", "12"] pop ise son elemanı alır
        const alarmId = Number(req.url.split("/").pop()); 

        if (!Number.isInteger(alarmId) || alarmId <= 0) {
            res.writeHead(400, {
                "Content-Type": "application/json; charset=utf-8"
            });

            return res.end(JSON.stringify({
                success: false,
                message: "Geçersiz alarm ID."
            }));
        }

        let body = "";

        req.on("data", (chunk) => {
            body += chunk.toString();
        });

        req.on("end", async () => {
            try {
                const {
                    recipientUserId,
                    metricType,
                    threshold,
                    severity,
                    isActive
                } = JSON.parse(body);

                if (
                    recipientUserId === null ||
                    recipientUserId === undefined ||
                    !metricType ||
                    threshold === null ||
                    threshold === undefined ||
                    !severity ||
                    typeof isActive !== "boolean"
                )
                {
                    res.writeHead(400, {
                        "Content-Type": "application/json; charset=utf-8"
                    });

                    return res.end(JSON.stringify({
                        success: false,
                        message: "Güncellenecek alarm bilgileri eksik."
                    }));
                }

                const result = await pool.query(
                    `UPDATE alarms
                    SET
                        recipient_user_id = $1,
                        metric_type = $2,
                        threshold = $3,
                        severity = $4,
                        is_active = $5
                    WHERE id = $6
                    RETURNING id, recipient_user_id, metric_type, threshold, severity, is_active, created_at`,
                    [
                        recipientUserId,
                        metricType,
                        threshold,
                        severity,
                        isActive,
                        alarmId
                    ]
                );

                if (result.rows.length === 0) {
                    res.writeHead(404, {
                        "Content-Type": "application/json; charset=utf-8"
                    });

                    return res.end(JSON.stringify({
                        success: false,
                        message: "Güncellenecek alarm bulunamadı."
                    }));
                }

                res.writeHead(200, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                res.end(JSON.stringify({
                    success: true,
                    message: "Alarm başarıyla güncellendi.",
                    alarm: result.rows[0]
                }));
            }
            catch (error) {
                console.error("Alarm güncellenemedi:", error);

                if (!res.headersSent) {
                    res.writeHead(500, {
                        "Content-Type": "application/json; charset=utf-8"
                    });
                }

                res.end(JSON.stringify({
                    success: false,
                    message: "Sunucu hatası oluştu."
                }));
            }
        });
        return true;
    }

    if (req.method === "DELETE" && req.url.startsWith("/admin/alarms/")) {
        const alarmId = Number(req.url.split("/").pop());

        if (!Number.isInteger(alarmId) || alarmId <= 0) {
            res.writeHead(400, {
                "Content-Type": "application/json; charset=utf-8"
            });

            return res.end(JSON.stringify({
                success: false,
                message: "Geçersiz alarm ID."
            }));
        }

        try {
            const result = await pool.query(
                `DELETE FROM alarms
                WHERE id = $1
                RETURNING id`,
                [alarmId]
            );

            if (result.rows.length === 0) {
                res.writeHead(404, {
                    "Content-Type": "application/json; charset=utf-8"
                });

                return res.end(JSON.stringify({
                    success: false,
                    message: "Silinecek alarm bulunamadı."
                }));
            }

            res.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8"
            });

            res.end(JSON.stringify({
                success: true,
                message: "Alarm başarıyla silindi.",
                deletedAlarmId: result.rows[0].id
            }));
        }
        catch (error) {
            console.error("Alarm silinemedi:", error);

            if (!res.headersSent) {
                res.writeHead(500, {
                    "Content-Type": "application/json; charset=utf-8"
                });
            }

            res.end(JSON.stringify({
                success: false,
                message: "Sunucu hatası oluştu."
            }));
        }
        return true;
    }
    return false;
}

module.exports = handleAlarmRoutes;