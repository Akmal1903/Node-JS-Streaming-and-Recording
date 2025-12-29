const express = require("express");
const { routerRecord } = require("../Camera/routes/recordApi.js");
const { errorMiddleware } = require("../error/errorMiddleware");
const cors = require("cors");
const http = require("http");
const path = require('path');
const io = require('socket.io');
const web = express();
const HTTP = new http.Server(web);


web.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    exposedHeaders: ['Content-Length', 'Content-Range'],
}));

const SocketIO = io(HTTP, {
    cors: {
        origin: '*',
    },
    path: '/streams',
});


web.use(express.json());
web.use(routerRecord);
web.use(errorMiddleware);

const publicDir = path.join(__dirname, '..', '..', 'public');
web.use(express.static(publicDir));


module.exports = {
    web,
    HTTP,
    SocketIO
};