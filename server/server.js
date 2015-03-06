/* 
 * Author: Zhu Qichen
 * 
 * Copyright (C) 2014 Institute of Software, CAS <info@iscas.ac.cn>
 * 
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

var fs = require('fs');
var basename = require('path').basename;
var xattr = require('fs-xattr');
var mongodb = require('mongodb');
var WebSocketServer = require('ws').Server;
var crypto = require('crypto');

eval(fs.readFileSync(__dirname + '/const.js').toString());
eval(fs.readFileSync(__dirname + '/util.js').toString());
eval(fs.readFileSync(__dirname + '/websocket.js').toString());

var db = new mongodb.Db('test',new mongodb.Server("localhost", mongodb.Connection.DEFAULT_PORT, { auto_reconnect: true }), { w: 1 });
var userDb;
db.open(function(err, databaseConnection) {
	if (err) {
		return;
	}
	databaseConnection.collection('userdb', function(err, collection) {
		if (err) {
			return;
		}
		startWatch();
		userDb = collection;
		startWebSocket();
	});
});

process.stdin.resume();
function exitHandler(options, err) {
    debugLog('Exit');
	if (options.cleanup) {
		db.close();
	}
    if (err) {
		debugLog(err);
	}
    if (options.exit) {
		process.exit();
	}
}
process.on('SIGINT', exitHandler.bind(null, {cleanup: true, exit: true}));
process.on('uncaughtException', exitHandler.bind(null, {exit: true}));
