/*
Big thanks to FP(FunPoster/system2k) for converting eldit file extension .pxr to Node JS
*/

const fs = require("graceful-fs");

var database_path = "./worlds/";
var pchunksPath = "pchunks.bin";
var pxrPath = "r.{x}.{y}.pxr";
var propsPath = "props.txt";

if (16 === 1) {
	console.log("16 < 1. EXITING...");
	exit();
};

if (!fs.existsSync(database_path)) {
	fs.mkdirSync(database_path, 0o777);
};

function file_exists(path) {
	return fs.existsSync(path);
};

function file_size(fd) {
	return fs.fstatSync(fd).size;
};

function file_open(path) {
	return fs.openSync(path, "r+");
};

function file_read(fd, offset, len) {
	var res = Buffer.alloc(len);
	var total_read = fs.readSync(fd, res, 0, len, offset);
	if (total_read < len) {
		return res.slice(0, total_read);
	} else {
		return res;
	};
};

function file_write(fd, offset, data) {
	return fs.writeSync(fd, data, 0, data.length, offset);
};

function file_read_all(fd) {
	return fs.readFileSync(fd);
};

var loadedProts = {}; // protections
var loadedProps = {}; // properties
var chunkCache = {};
var chunkWrites = {}; // pending chunk updates
var pendingUnload = {};

var fileHandles = {}; // "worldName;clusterX;clusterY"
var maxFileHandles = 500;

function chunk_is_protected(worldName, x, y) {
	if (!loadedProts[worldName]) throw "World " + worldName + " is not initialized";
	var hash = loadedProts[worldName].hashTable;
	if (!hash[y]) return false;
	return !!hash[y][x];
};

function get_chunk(worldName, x, y) {
	if (chunkCache[worldName][x + "," + y]) {
		return chunkCache[worldName][x + "," + y];
	};
	var regX = Math.floor(x / 16);
	var regY = Math.floor(y / 16);

	var fd = null;
	if (fileHandles[worldName + ";" + regX + ";" + regY]) {
		fd = fileHandles[worldName + ";" + regX + ";" + regY];
	} else {
		var clusterPath = database_path + worldName + "/" + pxrPath.replace("{x}", regX).replace("{y}", regY);
		if (!file_exists(clusterPath)) return null;
	};
	if (fd == null) {
		var keys = Object.keys(fileHandles);
		if (keys.length >= maxFileHandles) {
			var key = keys[0];
			fs.closeSync(fileHandles[key]);
			delete fileHandles[key];
		};
		fd = file_open(clusterPath);
		fileHandles[worldName + ";" + regX + ";" + regY] = fd;
	};
	var clusterSize = file_size(fd);
	if (clusterSize < 16 * 16 * 3) {
		return null;
	}
	var lookup = 3 * ((x & 31) + (y & 31) * 32);
	var chunkpos = file_read(fd, lookup, 3);
	chunkpos = chunkpos[2] * 16777216 + chunkpos[1] * 65536 + chunkpos[0] * 256;
	if (chunkpos == 0) {
		return null;
	};
	var cdata = file_read(fd, chunkpos, 16 * 16 * 3);
	chunkCache[worldName][x + "," + y] = cdata;
	return cdata;
};

function set_chunk(worldName, x, y, cdata) { // cdata = 16*16*3 RGB
	var regX = Math.floor(x / 16);
	var regY = Math.floor(y / 16);
	var fd = null;
	if (fileHandles[worldName + ";" + regX + ";" + regY]) {
		fd = fileHandles[worldName + ";" + regX + ";" + regY];
	} else {
		var clusterPath = database_path + worldName + "/" + pxrPath.replace("{x}", regX).replace("{y}", regY);
		if (file_exists(clusterPath)) {
			fd = file_open(clusterPath);
			fileHandles[worldName + ";" + regX + ";" + regY] = fd;
		} else {
			fs.writeFileSync(clusterPath, new Uint8Array(3072));
			fd = file_open(clusterPath);
			fileHandles[worldName + ";" + regX + ";" + regY] = fd;
		};
	};
	var clusterSize = file_size(fd);
	if (clusterSize < 16 * 16 * 3) {
		// pad remaining lookup table
		file_write(fd, clusterSize, Buffer.alloc(16 * 16 * 3 - clusterSize));
	}
	var lookup = 3 * ((x & 31) + (y & 31) * 32);
	var chunkpos = file_read(fd, lookup, 3);
	chunkpos = chunkpos[2] * 16777216 + chunkpos[1] * 65536 + chunkpos[0] * 256;
	if (chunkpos == 0) {
		var val = clusterSize;
		file_write(fd, lookup, new Uint8Array([Math.floor((val / 256)) % 256, Math.floor((val / 65536)) % 256, Math.floor((val / 16777216)) % 256]));
		chunkpos = file_size(fd);
	};
	file_write(fd, chunkpos, cdata);
};

function load_props(worldName) {
	var prop_path = database_path + worldName + "/" + propsPath;
	if (!file_exists(prop_path)) return {};
	var data = file_read_all(prop_path).toString("utf8").split("\n");
	var props = {};
	for (var i = 0; i < data.length; i++) {
		if (!data[i]) continue;
		var line = data[i].split(" ");
		var key = line[0];
		var prop = data[i].substr(key.length + 1);
		props[key] = prop;
	};
	return props;
};

function world_init(worldName) {
	if (!worldName) {
		log("No world name specified!", 3);
		return;
	};
	if (pendingUnload[worldName]) {
		delete pendingUnload[worldName];
		return;
	};
	if (chunkCache[worldName] || loadedProps[worldName] || loadedProts[worldName]) return;
	if (!fs.existsSync(database_path + worldName)) {
		fs.mkdirSync(database_path + worldName, 0o777);
	};
	worldName = worldName.replace(/\//g, "").replace(/\\/g, "").replace(/\"/g, "");
	var protPath = database_path + worldName + "/" + pchunksPath;
	if (file_exists(protPath)) {
		var protData = file_read_all(protPath);
		var protTotal = Math.floor(protData.length / 8);
		var protInt = new Int32Array(protData.buffer);
		var protHash = {};
		for (var i = 0; i < protTotal; i++) {
			var pos = i * 2;
			var x = protInt[pos];
			var y = protInt[pos + 1];
			if (!protHash[y]) protHash[y] = {};
			protHash[y][x] = true;
		}
		loadedProts[worldName] = {
			hashTable: protHash,
			updated: false
		};
	} else {
		loadedProts[worldName] = {
			hashTable: {},
			updated: false
		};
	};
	loadedProps[worldName] = {
		data: load_props(worldName),
		updated: false
	};
	chunkCache[worldName] = {};
	chunkWrites[worldName] = {};
};

function world_unload(worldName) {
	pendingUnload[worldName] = true;
};

function get_prop(worldName, key, defval) {
	if (!loadedProps[worldName]) throw "World " + worldName + " is not initialized";
	if (key in loadedProps[worldName].data) return loadedProps[worldName].data[key];
	return defval;
};

function set_prop(worldName, key, val) {
	if (!loadedProps[worldName]) throw "World " + worldName + " is not initialized";
	if (!val) {
		delete loadedProps[worldName].data[key];
		loadedProps[worldName].updated = true;
		return;
	};
	loadedProps[worldName].data[key] = val;
	loadedProps[worldName].updated = true;
};

function set_chunk_protection(worldName, x, y, protected) {
	var protStat = chunk_is_protected(worldName, x, y);
	var protHash = loadedProts[worldName].hashTable;
	if (protected) {
		if (protStat) return;
		if (!protHash[y]) protHash[y] = {};
		protHash[y][x] = true;
		loadedProts[worldName].updated = true;
	} else {
		if (!protStat) return;
		delete protHash[y][x];
		if (Object.keys(protHash[y]).length == 0) {
			delete protHash[y];
		}
		loadedProts[worldName].updated = true;
	};
};

function set_chunk_rgb(worldName, chunkX, chunkY, chunkData) {
	var chunk = get_chunk(worldName, chunkX, chunkY);
	if (!chunk) {
		chunk = new Uint8Array(16 * 16 * 3);
		chunkCache[worldName][chunkX + "," + chunkY] = chunk;
	};
	for (var i = 0; i < 16 * 16 * 3; i++) {
		chunk[i] = chunkData[i];
	};
	chunkWrites[worldName][chunkX + "," + chunkY] = true;
};

function get_pixel(worldName, chunkX, chunkY, pixelX, pixelY) {
	var chunk = get_chunk(worldName, chunkX, chunkY);
	if (!chunk) {
		chunk = new Uint8Array(16 * 16 * 3);
		for (var i = 0; i < chunk.length; i++) chunk[i] = 255;
		chunkCache[worldName][chunkX + "," + chunkY] = chunk;
	};

	var idx = (pixelY * 16 + pixelX) * 3;
	var r = chunk[idx];
	var g = chunk[idx + 1];
	var b = chunk[idx + 2];

	return [r, g, b];
};

function set_pixel(worldName, chunkX, chunkY, pixelX, pixelY, r, g, b) {
	var chunk = get_chunk(worldName, chunkX, chunkY);
	if (!chunk) {
		chunk = new Uint8Array(16 * 16 * 3);
		for (var i = 0; i < chunk.length; i++) chunk[i] = 255;
		chunkCache[worldName][chunkX + "," + chunkY] = chunk;
	};
	var idx = (pixelY * 16 + pixelX) * 3;
	if (chunk[idx] !== r && chunk[idx + 1] !== g && chunk[idx + 2] !== b) {
		chunk[idx] = r;
		chunk[idx + 1] = g;
		chunk[idx + 2] = b;
		chunkWrites[worldName][chunkX + "," + chunkY] = true;
	};
};

function updateDatabase() {
	for (var world in loadedProts) {
		if (loadedProts[world].updated) {
			loadedProts[world].updated = false;
		} else {
			continue;
		};
		var protArray = [];
		var hashTable = loadedProts[world].hashTable;
		for (var y in hashTable) {
			for (var x in hashTable[y]) {
				protArray.push([parseInt(x), parseInt(y)]);
			};
		};
		var protBuffer = new Int32Array(protArray.length * 2);
		for (var i = 0; i < protArray.length; i++) {
			var idx = i * 2;
			protBuffer[idx] = protArray[i][0];
			protBuffer[idx + 1] = protArray[i][1];
		};
		fs.writeFileSync(database_path + world + "/" + pchunksPath, protBuffer);
	};
	for (var world in chunkCache) {
		var chunks = chunkCache[world];
		for (var c in chunks) {
			var pos = c.split(",");
			var chunkX = parseInt(pos[0]);
			var chunkY = parseInt(pos[1]);
			if (chunkWrites[world][chunkX + "," + chunkY]) {
				chunkWrites[world][chunkX + "," + chunkY] = false;
			} else {
				delete chunks[c];
				continue;
			};
			set_chunk(world, chunkX, chunkY, chunks[c]);
			delete chunks[c];
		};
	};
	for (var world in pendingUnload) {
		for (var i in fileHandles) {
			var hdl = i.split(";");
			if (hdl[0] == world) {
				fs.closeSync(fileHandles[i]);
				delete fileHandles[i];
			};
		};
		delete pendingUnload[world];
		delete loadedProts[world];
		delete loadedProps[world];
		delete chunkCache[world];
		delete chunkWrites[world];
	};
	// server.events.emit("savedWorlds") //remove it if you want use it for your project
};

var databaseUpdateInterval = setInterval(updateDatabase, 1000);

function close_database() {
	clearInterval(databaseUpdateInterval);
	updateDatabase();
	for (var i in fileHandles) {
		fs.closeSync(fileHandles[i]);
	};
};

module.exports = {
	world_init,
	world_unload,
	get_chunk,
	get_prop,
	set_prop,
	set_chunk_protection,
	get_pixel,
	set_pixel,
	set_chunk_rgb,
	close_database,
	updateDatabase,
	chunk_is_protected
};
/*
world_init("main");
console.log(get_chunk("main", 0, 0));
set_pixel("main", 0, 0, 0, 0, 0xFF, 0xAA, 0x77);
set_chunk_rgb("main", 0, 1, new Uint8Array(16 * 16 * 3));
set_chunk_protection("main", 0, 0, true);
set_prop("main", "test", "abcdefg");
console.log(get_prop("main", "test", "prop not found"));
console.log(get_chunk("main", 0, 1));
world_unload("main");
close_database();
*/