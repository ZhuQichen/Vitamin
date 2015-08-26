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

var actionHandler = {
	auth: function(username, password, callback) {
		userDb.find({'user': username}).toArray(function(err, result) {
			if (err || !(result[0] && (hash(password) === result[0].password) && result[0].uid)) {
				callback(true);
			} else {
				callback(false, result[0].uid);
			}
		});
	},

	list: function(uid, callback) {
		fs.readdir(getVertexPath(uid), function(err, data) {
			if (err) {
				callback(err);
			} else {
				var count = data.length;
				var list = {};
				if (count == 0) {
					callback(null, list);
				} else {
					data.forEach(function(vid) {
						actionHandler.getVertex(uid, vid, function(err, data) {
							if (!err) {
								list[vid] = data;
							}
							if ((--count) <= 0) {
								callback(null, list);
							}
						});
					});
				}
			}
		});
	},

	getDate: function(uid, vid, callback) {
		fs.stat(getDataPath(uid, vid), function(err, stat) {
			if (err) {
				callback(err);
			} else {
				callback(null, stat.mtime.getTime());
			}
		});
	},

	getData: function(uid, vid, callback) {
		readJSON(getDataPath(uid, vid) , callback);
	},

	getMode: function(uid, vid, callback) {
		readText(getAttrPath(uid, vid, 'mode'), function(err, data) {
			if (err) {
				callback(err);
			} else {
				var mode = parseInt(data);
				if (isNaN(mode)) {
					callback(true);
				} else {
					callback(null, {
						bool: parseInt((mode % 1024) / 512) === 1,
						visible: parseInt((mode % 256) / 128) === 1,
						sync: parseInt((mode % 128) / 64) === 1
					});
				}
			}
		});
	},

	setMode: function(uid, vid, mode, callback) {
		writeText(getAttrPath(uid, vid, 'mode'), mode, callback);
	},

	getProfile: function(uid, vid, callback) {
		readJSON(getAttrPath(uid, vid, 'profile'), callback);
	},

	getEdge: function(uid, vid, callback) {
		fs.readdir(getEdgePath(uid, vid), callback);
	},

	getVertex: function(uid, vid, callback) {
		var result = {};
		var propertyList = ['Date', 'Data', 'Mode', 'Profile', 'Handler', 'Edge'];
		function getProperty(i) {
			actionHandler['get' + propertyList[i]](uid, vid, function(err, data) {
				if (err) {
					callback(err);
				} else {
					result[propertyList[i].toLowerCase()] = data;
					if (i <= 0) {
						callback(null, result);
					} else {
						getProperty(i - 1);
					}
				}
			});
		}
		getProperty(propertyList.length - 1);
	},

	getToday: function(uid, vid, callback) {
		xattr.get(getDataPath(uid, vid), "scan:{'today': {'limit': 24}}", function(err, data) {
			if (err) {
				callback(err);
			} else {
				parseJSON(data, callback);
			}
		});
	},

	setEnabled: function(uid, vid, enabled, callback) {
		xattr.set(getDataPath(uid, vid), enabled ? 'enable' : 'disable', '', callback);
	},

	addEdge: function(uid, vid, dst, callback) {
		createFile(getEdgePath(uid, vid, dst), callback);
	},

	removeEdge: function(uid, vid, dst, callback) {
		fs.unlink(getEdgePath(uid, vid, dst), callback);
	},

	getHandler: function(uid, vid, callback) {
		readText(getAttrPath(uid, vid, 'handler'), function(err, data) {
			if (err) {
				if (err.code === 'ENOENT') {
					callback(null, {});
				} else {
					callback(err);
				}
			} else {
				parseJSON(data.substr(2, str.indexOf("\n") - 2), callback);
			}
		});
	},

	setHandler: function(uid, vid, rule, callback) {
		if ('aspect' in rule && 'min' in rule && 'max' in rule && parseFloat(rule.min) === rule.min && parseFloat(rule.max) === rule.max) {
			var handler = '# ' + JSON.stringify(rule) + '\n' +
				'def func(args):\n' +
				'\tr = (' + rule.min + ', ' + rule.max + ')\n' +
				'\treal = args.popitem()[1]\n' +
				'\tval = float(real[' + rule.aspect + '])\n' +
				'\tif val >= r[0] and val <= r[1]:\n' +
				'\t\treturn {"Enable": True}\n' +
				'\telse:\n' +
				'\t\treturn {"Enable": False}\n';
			writeText(getAttrPath(uid, vid, 'handler'), handler, callback);
		} else {
			callback(true);
		}
	},

	setSync: function(uid, vid, enabled, callback) {
		actionHandler.getMode(uid, vid, function(err, mode) {
			if (err) {
				callback(err);
			} else {
				mode = parseInt(mode / 128) * 128 + mode % 64 + (enabled ? 64 : 0);
				actionHandler.setMode(uid, vid, mode, callback);
			}
		});
	}
};

var watchList = {};

var webSocketServer;
function startWebSocket(db) {
	webSocketServer = new WebSocketServer({port: WEBSOCKET_PORT});
	webSocketServer.on('connection', function(webSocket) {
		var session = {id: randomId(), uid: '', watchState: false, webSocket: webSocket};
		function webSocketSend(messageId, err, data) {
			var message = {id: messageId};
			if (err) {
				debugLog(err);
				message.err = true;
			}
			if (typeof data !== 'undefined') {
				message.data = data;
			}
			webSocket.send(JSON.stringify(message));
		}

		webSocket.on('message', function(messageString) {
			debugLog('Client: ' + messageString);
			try {
				var message = JSON.parse(messageString);
			} catch(e) {
				return;
			}
			if ((message.action !== 'auth' && session.uid === '') ||
				!actionHandler.hasOwnProperty(message.action) || typeof message.id !== 'number') return;
			var handler = actionHandler[message.action];
			function done(err, data) {
				webSocketSend(message.id, err, data);
			}
			if (message.action === 'auth') {
				if (!(typeof message.data === 'object' && message.data.user && message.data.password)) return;
				handler(message.data.user, message.data.password, function (err, uid) {
					if (!err) {
						session.uid = uid;
					}
					done(err);
				});
			} else if (message.action === 'list') {
				handler(session.uid, function (err, list) {
					done(err, list);
					if (!session.watchState) {
						var date = {};
						for (var i in list) {
							date[i] = list[i].date;
						}
						addWatch(session, date, webSocketSend, message.id);
					}
				});
			} else if (testName(message.vertex)) {
				if (handler.length === 3) {
					handler(session.uid, message.vertex, done);
				} else if (message.data != null) {
					handler(session.uid, message.vertex, message.data, done);
				}
			}
		});

		webSocket.on('close', function() {
			if (session.uid in watchList) {
				if (session.id in watchList[session.uid].send) {
					delete watchList[session.uid].send[session.id];
					if (Object.keys(watchList[session.uid].send).length == 0) {
						delete watchList[session.uid];
					}
				}
			}
			debugLog("Close");
		});

		webSocket.on('error', function() {
			debugLog("Error");
		});
	});
}

function scan(watch) {
	fs.readdir(getUserPath(watch.session.uid), function(err, data) {
		if (err) {
			debugLog(err);
		} else {
			var count = data.length;
			var newDate = {};
			function getVertexListDone() {
				//TODO: Refresh without getVertexList
				var change = false;
				for (var i in watch.date) {
					if (i in newDate) {
						if (watch.date[i] !== newDate[i]) {
							change = true;
						}
					} else {
						change = true;
					}
				}
				for (var i in newDate) {
					if (!(i in watch.date)) {
						change = true;
					}
				}
				watch.date = newDate;
				if (change) {
					actionHandler.list(watch.session.uid, function(err, list) {
						for (var i in watch.send) {
							watch.send[i].func(watch.send[i].id, Boolean(err), list);
						}
					});
				}
			}
			if (count == 0) {
				getVertexListDone();
				return;
			}
			data.forEach(function(vid) {
				fs.stat(getDataPath(watch.session.uid, vid), function(err, data) {
					if (err) {
						debugLog(err);
						newDate[vid] = 0;
					} else if (data.isFile()) {
						newDate[vid] = data.mtime.getTime();
					}
					count--;
					if (count <= 0) {
						getVertexListDone();
					}
				});
			});
		}
	});
}

function addWatch(session, date, send, id) {
	if (session.watchState) {
		return;
	}
	session.watchState = true;
	if (!(session.uid in watchList)) {
		watchList[session.uid] = {session: session, date: date, send: {}};
	}
	watchList[session.uid].send[session.id] = {func: send, id: id};
}

function startWatch() {	
	setInterval(function() {
		for (var i in watchList) {
			scan(watchList[i]);
		}
	}, 60000);
}
