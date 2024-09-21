const config = require("../../../config");
const commandPermissions = require("./commandPermissions.json");

class Commands {
    constructor(chat, client, world) {
        chat = chat.substr(1);
        this.world = world;
        this.command = chat.split(" ")[0].toLowerCase();
        this.args = chat.split(" ");
        this.args.shift();
        this.client = client;
        server.events.emit("command", this.client, this.command, this.args);
        if(typeof this[this.command] == "function" && this.command !== "sendTo") {
            let requiredRank = commandPermissions[this.command] || 0;
            if(this.client.rank >= requiredRank) {
                this[this.command](...this.args);
            } else {
                this.client.send("You don't have permission!");
            };
        };
    }
    help() {
        let methodNames = Object.keys(commandPermissions).filter(cmd => this.client.rank >= commandPermissions[cmd]);
        let helpString = methodNames.join(', ');
        this.client.send("Commands: " + helpString);
    }
    nick(...N) {
        let newNick = N.join(" ");
        newNick = newNick.replaceAll(/\n/gm, '');
        if(newNick.length == 0) {
            this.client.nick = '';
            this.client.send("Nickname reset.");
            return;
        };
        if(newNick.length <= config.maxNickLength || this.client.rank > 1) {
            this.client.nick = newNick;
            this.client.send(`Nickname set to: "${newNick}"`);
        } else {
            this.client.send(`Nickname too long! (Max: "${config.maxNickLength}")`);
        };
    }
    adminlogin(password) {
        if(server.checkPassword("adminlogin", password)) {
            this.client.setRank(3);
            this.client.send("[Server] You are now an admin. Do /help for a list of commands.");
        } else {
            this.client.send("[Server] Wrong password.");
        };
    }
    modlogin(password) {
        if(server.checkPassword("modlogin", password)) {
            this.client.setRank(2);
            this.client.send("[Server] You are now a moderator. Do /help for a list of commands.");
        } else {
            this.client.send("[Server] Wrong password.");
        };
    }
    tell(id) {
        id = parseInt(id);
        let msg = this.args;
        msg.shift();
        msg = msg.join(" ");
        let target = this.world.clients.find(function(target) {
            return target.id == id;
        });
        if(target && msg) {
            if(target.id !== this.client.id) {
                this.client.send(`[me -> ${target.id}] ${msg}`);
                target.send(`[${this.client.id} -> me] ${msg}`);
            } else {
                this.client.send(`You can't DM yourself.`);
            };
        } else if(!target && msg) {
            this.client.send(`User ${id} not found.`);
        } else {
            this.client.send("Usage:\n /tell [id] [msg]");
        };
    }
    kick(id) {
        id = parseInt(id);
        let target = this.world.clients.find(function(item) {
            return item.id == id;
        });
        if(target.rank >= this.client.rank) {
            this.client.send("Target's rank is not lower than yours.");
            return;
        };
        if(target) {
            target.ws.close();
            server.players.sendToWorld(this.world.name, `DEVKicked: ${id} (${target.ip})`, 3);
        } else if(!id) {
            this.client.send("Usage:\n /kick [id]");
        } else if(!target) {
            this.client.send(`User with id ${id} not found.`);
        };
    }
    setrank(id, rank) {
        id = parseInt(id);
        rank = parseInt(rank);
        var target = this.world.clients.find(function(client) {
            return client.id == id;
        });
        if(isNaN(rank)) {
            this.client.send("Usage:\n /setrank [target id] [new rank from 0 to 3]");
        } else if(!target) {
            this.client.send(`Cannot find client with id ${id}`);
        } else if(target.rank >= this.client.rank && target.id !== this.client.id) {
            this.client.send("You cannot change the rank of players who have a higher rank than you or equal.");
        } else {
            this.client.send(`Changed rank of ${target.id} (${target.rank}) to ${rank}`);
            target.setRank(rank);
        };
    }
    tp(targetId) {
        let target;
        let x, y;
        let message;
        switch(this.args.length) {
            case 3:
                target = this.world.clients.find(function(item) {
                    return item.id == targetId;
                });
                if(target) {
                    x = this.args[1];
                    y = this.args[2];
                    message = `Teleported player ${targetId} (${target.x_pos}, ${target.y_pos}) to ${x},${y}`;
                } else {
                    message = `Error! Player '${targetId}' not found!`;
                };
                break;
            case 2:
                target = this.client;
                x = this.args[0];
                y = this.args[1];
                message = `Teleported to ${x} ${y}`;
                break;
            case 1:
                var destination = this.world.clients.find(function(item) {
                    return item.id == targetId;
                });
                if(destination) {
                    target = this.client;
                    x = Math.floor(destination.x_pos / 16);
                    y = Math.floor(destination.y_pos / 16);
                    message = `Teleported to player ${targetId} (${x},${y})`;
                } else {
                    message = `Error! Player '${targetId}' not found!`;
                };
                break;
            default:
                this.client.send("To change the position of another player: /tp id x y");
                this.client.send("To teleport to another player: /tp id");
                this.client.send("To change your location: /tp x y");
                break;
        }
        if(target) {
            target.teleport(x, y);
            this.client.send(message);
        };
    }
}

module.exports = Commands;