const jwt = require("jsonwebtoken");

function verifyToken(req, res, jwtSecret) {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        res.writeHead(401, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            success: false,
            message: "Yetkilendirme tokeni bulunamadı."
        }));

        return null;
    }

    if (!authHeader.startsWith("Bearer ")) {
        res.writeHead(401, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            success: false,
            message: "Geçersiz yetkilendirme formatı."
        }));

        return null;
    }

    const token = authHeader.slice(7);

    try {
        const decoded = jwt.verify(token, jwtSecret);

        return decoded;
    }
    catch (error) {
        res.writeHead(401, {
            "Content-Type": "application/json; charset=utf-8"
        });

        res.end(JSON.stringify({
            success: false,
            message: "Token geçersiz veya süresi dolmuş."
        }));

        return null;
    }

}

module.exports = verifyToken;