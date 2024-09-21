const fs = require("graceful-fs");
const WebSocket = require("ws");
const express = require("express");
const EventEmitter = require("events");
const http = require("http");
const path = require('path');

const app = express();

app.use(function (req, res, next) {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
	res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
	next();
});

const httpserver = http.createServer(app);

const UpdateClock = require("./modules/server/UpdateClock.js");
var config = require("./config.json");
var terminatedSocketServer = false;

require('dotenv').config();

global.server = {
	worlds: [],
	config,
	updateClock: new UpdateClock(),
	events: new EventEmitter(),
	players: require("./modules/connection/player/players.js"),
	databases: {},
	checkPassword: (variable, password) => {
		const passwordFromEnvironment = process.env[variable];
		if (!password) return false;
		if (passwordFromEnvironment && passwordFromEnvironment === password) return true;
		return false;
	}
};
global.server.events.setMaxListeners(0);

httpserver.listen(config.port, () => {
	console.log('Query running on 0.0.0.0:' + config.port);
});

const manager = require("./modules/server/manager.js");
server.manager = manager;
const Connection = require('./modules/server/Connection.js');

const wss = new WebSocket.Server({
	server: httpserver
});
wss.on("connection", async function (ws, req) {
	let ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress).split(",")[0].replace('::ffff:', '');
	if (terminatedSocketServer) {
		ws.send(config.closeMsg);
		ws.close();
	};
	if (config.maxConnections > 0) {
		if (server.players.getAllPlayers().length >= config.maxConnections) {
			ws.send("Reached max connections limit")
			ws.close();
			return;
		};
	};
	if (config.maxConnectionsPerIp > 0) {
		let players = server.players.getAllPlayersWithIp(ip);

		let ranks = Object.values(players).map(player => player.rank);

		if (players.length > 0) {
			if (ranks.includes(3)) {

				if (players.length >= config.maxConnectionsPerAdminIp && config.maxConnectionsPerAdminIp !== -1) {
					ws.send("Reached max connections per ip limit");
					ws.close();
					return;
				};
			} else {
				if (players.length >= config.maxConnectionsPerIp) {
					ws.send("Reached max connections per ip limit");
					ws.close();
					return;
				};
			};
		};
	};

	new Connection(ws, req);
});

let files = [];

// thanks arthurDent ( https://stackoverflow.com/users/8842015/arthurdent )
const getFilesRecursively = (directory) => {
	const filesInDirectory = fs.readdirSync(directory);
	for (const file of filesInDirectory) {
		let absolute = path.join(directory, file);
		if (fs.statSync(absolute).isDirectory()) {
			getFilesRecursively(absolute);
		} else {
			files.push(absolute);
			let routePath = `/${path.relative("routing/", absolute).replace(/\\/g, '/')}`;
			app.get(routePath, (req, res) => {
				return res.sendFile(absolute, {
					root: '.'
				});
			});
		};
	};
};
getFilesRecursively("./routing/");

app.get('/*', (req, res) => {
	return res.sendFile(path.resolve("./routing/index.html"));
});

var rl = require("readline").createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: ""
});

rl.prompt();

if (process.platform === "win32") {
	rl.on("SIGINT", function () {
		process.emit("SIGINT");
	});
};

async function exit() {
	for (var w in server.worlds) {
		var world = server.worlds[w];
		for (var c = 0; c < world.clients.length; c++) {
			var client = world.clients[c];
			client.send(config.messages.closeMsg);
		};
	};
	await server.manager.close_database();
	process.exit();
};

process.on("SIGINT", exit)
process.on("beforeExit", exit);

rl.on("line", function (d) {
	var msg = d.toString().trimLeft().trimRight();
	if (terminatedSocketServer) return;
	if (msg.startsWith('/')) msg = msg.replace('/', '');
	new Command(msg);
	rl.prompt();
});