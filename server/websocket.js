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
	auth: function(db, user, password, callback) {
		db.find({'user': user}).toArray(function(err, result) {
			if (err || !(result[0] && (hash(password) === result[0].password) && result[0].uid)) {
				callback(true);
			} else {
				callback(false, result[0].uid);
			}
		});
	},

	getDate: function(uid, vertex, callback) {
		fs.stat(getDataPath(uid, vertex), function(err, stat) {
			if (err) {
				callback(err);
			} else {
				callback(null, stat.mtime.getTime());
			}
		});
	},

	getData: function(uid, vertex, callback) {
		fs.readFile(getDataPath(uid, vertex), {encoding: 'utf8', flag: 'r'} , callback);
	},

	getMode: function(uid, vertex, callback) {
		fs.readFile(getAttrPath(uid, vertex, 'mode'), {encoding: 'utf8', flag: 'r'} , callback);
	},

	getProfile: function(uid, vertex, callback) {
		fs.readFile(getAttrPath(uid, vertex, 'profile'), {encoding: 'utf8', flag: 'r'} , callback);
	},

	getEdge: function(uid, vertex, callback) {
		fs.readdir(getEdgePath(uid, vertex), callback);
	},

	getVertex: function(uid, vertex, callback) {
		var propertyList = ['Date', 'Data', 'Mode', 'Profile', 'Edge'];
		var result = {};
		var count = propertyList.length;
		function readProperty(property) {
			actionHandler['get' + property](uid, vertex, function(err, data) {
				if (!err) {
					result[property.toLowerCase()] = data;
				}
				if ((--count) <= 0) {
					callback(result);
				}
			});
		}
		for (var i = 0; i < propertyList.length; i++) {
			readProperty(propertyList[i]);
		}
	},

	list: function(uid, callback) {
		fs.readdir(getVertexPath(uid, vertex), function(err, data) {
			if (err) {
				callback(err);
			} else {
				var count = data.length;
				var list = {};
				if (count == 0) {
					callback(null, list);
				} else {
					function readVertex(vertex) {
						actionHandler.getVertex(uid, vertex, function(data) {
							list[vertex] = data;
							if ((--count) <= 0) {
								callback(null, list);
							}
						});
					}
					for (var i in data) {
						readVertex(data[i]);
					}
				}
			}
		});
	},

	getToday: function(uid, vertex, callback) {
		xattr.get(getDataPath(uid, vertex), 'today_24', callback);
	},

	enable: function(uid, vertex, callback) {
		xattr.set(getDataPath(uid, vertex), 'enable', '', callback);
	},

	disable: function(uid, vertex, callback) {
		xattr.set(getDataPath(uid, vertex), 'disable', '', callback);
	},

	setRule: function(uid, vertex, data, callback) {
		createFile(getEdgePath(uid, vertex) + '/' + data.dst, function(err) {
			if (err && err.code !== 'EEXIST') {
				callback(err);
			} else {
				var handler = 'def func(args):\n' +
					'\tr = (' + data.min + ', ' + data.max + ')\n' +
					'\treal_args = args.values()[0]\n' +
					'\tval = float(real_args.values()[' + data.aspect + '])\n' +
					'\tif val >= r[0] and val <= r[1]:\n' +
					'\t\treturn {"Enable":True}\n';
				fs.writeFile(getAttrPath(uid, vertex, 'handler'), handler, {encoding: 'utf8', mode: 0644, flag: 'w'}, callback);
			}
		});
	}
}

var watchList = {};

function startWebSocket(db) {
	webSocketServer = new WebSocketServer({port: 8090});
	webSocketServer.on('connection', function(webSocket) {
		var session = {id: randomId(), uid: '', path: '', watchState: false, webSocket: webSocket};
		function webSocketSend(messageId, err, data) {
			webSocket.send(JSON.stringify({sessionId: session.id, id: messageId, err: Boolean(err), data: data}));
			if (err) {
				debugLog(err);
			}
		}
		
		webSocket.on('message', function(messageString) {
			debugLog('Client Said: ' + messageString);
			try { var message = JSON.parse(messageString); } catch (e) { return; }
			if (!(message && message.sessionId && message.id && message.action && actionHandler.hasOwnProperty(message.action))) return;
			if (message.action === 'auth') {
				if (message.data && message.data.user && message.data.password) {
					actionHandler[message.action](db, message.data.user, message.data.password, function(err, uid) {
						if (!err) {
							session.uid = uid;
							session.path = devfsPath + '/' + uid;
						}
						webSocketSend(message.id, err);
					});
				} else {
					webSocketSend(message.id, true);
				}
			} else if (session.uid) {
				if (message.action === 'list') {
					actionHandler[message.action](session.uid, function(err, list) {
						webSocketSend(message.id, err, list);
						if (!session.watchState) {
							var date = {};
							for (var i in list) {
								date[i] = list[i].date;
							}
							addWatch(session, date, webSocketSend);
						}
					});
				} else if (message.vertex) {
					if (message.action.indexOf('get') == 0) {
						actionHandler[message.action](session.uid, message.vertex, function(err, data) {
							webSocketSend(message.id, err, data);
						});
					} else if (message.action.indexOf('set') == 0) {
						if (message.data) {
							actionHandler[message.action](session.uid, message.vertex, message.data, function(err) {
								webSocketSend(message.id, err);
							});
						}
					} else if ((message.action === 'enable') || (message.action === 'disable')) {
						actionHandler[message.action](session.uid, message.vertex, function(err) {
							webSocketSend(message.id, err);
						});
					}
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
	fs.readdir(watch.session.path, function(err, data) {
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
							watch.send[i]({action: 'list', err: Boolean(err), data: list},
									JSON.stringify({action: 'list', err: Boolean(err)}));
						}
					});
				}
			}
			if (count == 0) {
				getVertexListDone();
				return;
			}
			function readVertex(index) {
				var vertex = data[index];
				fs.stat(watch.session.path + '/' + vertex, function(err, data) {
					if (err) {
						debugLog(err);
						newDate[vertex] = 0;
					} else if (data.isFile()) {
						newDate[vertex] = data.mtime.getTime();
					}
					count--;
					if (count <= 0) {
						getVertexListDone();
					}
				});
			}
			for (var index = 0; index < data.length; index++) {
				readVertex(index);
			}
		}
	});
}

function addWatch(session, date, send) {
	if (session.watchState) {
		return;
	}
	session.watchState = true;
	if (!(session.uid in watchList)) {
		watchList[session.uid] = {session: session, date: date, send: {}};
	}
	watchList[session.uid].send[session.id] = send;
}

function startWatch() {	
	setInterval(function() {
		for (var i in watchList) {
			scan(watchList[i]);
		}
	}, 60000);
}
