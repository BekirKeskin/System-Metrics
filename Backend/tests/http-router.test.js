process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");

const handleHttpRoute = require("../routes/http-router");

function createMockResponse() {

    return {
        statusCode: null,
        headers: null,
        body: "",
        headersSent: false,

        writeHead(statusCode, headers = {}) {

            this.statusCode = statusCode;
            this.headers = headers;
            this.headersSent = true;
        },

        end(body = "") {
            this.body = body;
        }
    };
}

test("GET / isteği 200 dönmeli", async () => {

    const req = {
        method: "GET",
        url: "/"
    };

    const res = createMockResponse();

    const handled = await handleHttpRoute(req, res, "test-secret");

    assert.strictEqual(handled, true);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body, "Server Çalışıyor!");
});

test("Bilinmeyen endpoint router tarafından işlenmemeli", async () => {

    const req = {
        method: "GET",
        url: "/olmayan-endpoint"
    };

    const res = createMockResponse();

    const handled = await handleHttpRoute(req, res, "test-secret");

    assert.strictEqual(handled, false);
    assert.strictEqual(res.statusCode, null);
});