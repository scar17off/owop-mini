class WorldTemplate {
	constructor(name) {
		this.name = name;
		this.latestId = 1;
		this.clients = [];
	};
	isFull() {
		return this.clients.length >= this.server.config.maxPlayersInWorld + 1;
	};
};

module.exports = WorldTemplate;