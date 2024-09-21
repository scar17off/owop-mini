const worldTemplate = require("../connection/world/worldTemplate.js");
const Commands = require("../connection/commands/Commands.js");
const Case = require('../connection/player/cases.js');
const Client = require('../connection/player/Client.js');
const protocol = require("./protocol.js");

class Connection {
    constructor(ws, req) {
        this.ws = ws;
        this.req = req;
        this.world = null;
        this.client = new Client(ws, req);
        this.player = false;

        ws.on("message", this.onMessage.bind(this));
        ws.on("close", this.onClose.bind(this));
        ws.on("error", this.onError.bind(this));

        ws.send(new Uint8Array([protocol.server.captcha, 3]));
    };
    onMessage(message) {
        var data = new Uint8Array(message)
        var len = message.length;
        var isBinary = (typeof message == "object");

        if (this.player && isBinary) {
            // player is sending not a message in chat, but a message to the server (placing pixel, requesting chunk, see: cases.js)
            new Case(message, this.client, this.world)
        } else if (this.player && !isBinary) {
            if (!this.client.chatBucket.canSpend(1)) return;

            if (len > 1 && message[len - 1] == String.fromCharCode(10)) {
                var chat = message.slice(0, len - 1).trim();
                if (chat.length < server.config.maxChatLength || this.client.rank === 3) {
                    if (chat[0] == "/") {
                        new Commands(chat, this.client, this.world);
                    } else {
                        if (this.client.rank === 1) {
                            var string = chat.split("\n").slice(0, 3).join("\n"); //weirdo way
                            string += chat.split("\n").slice(3).join("")
                            chat = string;
                        };

                        let before = "";

                        if (this.client.nick) {
                            before += `[${this.client.id}] ${this.client.nick}`;
                        } else {
                            before += this.client.id;
                        }

                        this.client.before = before;

                        server.players.sendToWorld(this.client.world, before + ": " + chat);

                        server.events.emit("chat", this.client, chat);
                    };
                };
            };
        } else if (!this.player && isBinary) {
            //player on real connect
            if (len > 2 && len - 2 <= 24) {
                for (var i = 0; i < data.length - 2; i++) {
                    this.client.world += String.fromCharCode(data[i]);
                }
                this.client.world = this.client.world.replace(/[^a-zA-Z0-9\._]/gm, "").toLowerCase();
                if (!this.client.world) this.client.world = "main";
                this.world = server.worlds.find(function (world) {
                    return world.name == this.client.world
                }.bind(this));
                if (!this.world) {
                    server.manager.world_init(this.client.world)
                    this.world = new worldTemplate(this.client.world);
                    server.worlds.push(this.world)
                    server.events.emit("newWorld", this.world)
                };

                this.client.setId(this.world.latestId);
                this.client.setRank(1);

                this.world.latestId++;
                this.player = true;
                this.world.clients.push(this.client);
                if (server.config.maxPlayersInWorld > 0) {
                    if (this.world.isFull()) {
                        this.client.send("World is full");
                        this.client.ws.close();
                        return;
                    };
                };
                server.events.emit("join", this.client);
                // send client list to that client
                server.updateClock.doUpdatePlayerPos(this.world.name, {
                    id: this.client.id,
                    x: 0,
                    y: 0,
                    r: 0,
                    g: 0,
                    b: 0,
                    tool: 0
                });
                for (var w in this.world.clients) {
                    var cli = this.world.clients[w];
                    var upd = {
                        id: cli.id,
                        x: cli.x_pos,
                        y: cli.y_pos,
                        r: cli.col_r,
                        g: cli.col_g,
                        b: cli.col_b,
                        tool: cli.tool
                    };
                    server.updateClock.doUpdatePlayerPos(this.world.name, upd);
                };
            };

        }
    };
    onClose() {
        if (!this.world) return;
        if (!this.client) return;
        server.events.emit("leave", this.client)
        var worldIndex = server.worlds.indexOf(this.world);
        var clIdx = this.world.clients.indexOf(this.client);
        if (clIdx > -1) {
            server.updateClock.doUpdatePlayerLeave(this.world.name, this.client.id)
            delete this.world.clients[clIdx]
            this.world.clients.sort().pop()
        };
        if (!this.world.clients.length) {
            server.manager.world_unload()
            delete server.worlds[worldIndex]
            server.worlds.sort().pop()
        };
    };
    onError(error) {
        console.log(error);
    };
};

module.exports = Connection;