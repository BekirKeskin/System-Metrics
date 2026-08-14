const handleCreateAlarm = require("../handlers/alarm/create-alarm-handler");
const handleGetAlarms = require("../handlers/alarm/get-alarms-handler");
const handleUpdateAlarm = require("../handlers/alarm/update-alarm-handler");
const handleDeleteAlarm = require("../handlers/alarm/delete-alarm-handler");

const alarmRoutes = [
    {
        method: "GET",
        path: "/admin/alarms",
        access: "admin",

        handler: (req, res, context) => handleGetAlarms(req, res, context.requestUrl)
    },

    {
        method: "POST",
        path: "/admin/alarms",
        access: "admin",

        handler: (req, res, context) => handleCreateAlarm(req, res, context.requestUrl)
    },

    {
        method: "PUT",
        path: /^\/admin\/alarms\/(\d+)$/,
        access: "admin",

        getParams: (match) => ({
            id: match[1]
        }),

        handler: (req, res, context) => handleUpdateAlarm(req, res, context.params, context.requestUrl)
    },

    {
        method: "DELETE",
        path: /^\/admin\/alarms\/(\d+)$/,
        access: "admin",

        getParams: (match) => ({
            id: match[1]
        }),

        handler: (req, res, context) => handleDeleteAlarm(req, res, context.params, context.requestUrl)
    }
];

module.exports = alarmRoutes;