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

/* Reference
 * auth		  {action, user, password} = {action, err}
 * list		  {action}				   = {action, err, data}
 * enable	  {action, vertex}		   = {action, vertex, err}
 * disable	  {action, vertex}		   = {action, vertex, err}
 * getVertex  {action, vertex}		   = {action, vertex, err, data}
 * getData	  {action, vertex}		   = {action, vertex, err, data}
 * getToday	  {action, vertex}		   = {action, vertex, err, data}
 * getEdge	  {action, vertex}		   = {action, vertex, err, data}
 * getDate	  {action, vertex}		   = {action, vertex, err, data}
 * getMode	  {action, vertex}		   = {action, vertex, err, data}
 * getProfile {action, vertex}		   = {action, vertex, err, data}
 */

var actionHandler = {
	auth: function (db, user, password, callback) {
		db.find({'user': user}).toArray(function (err, result) {
			if (err || !(result[0] && (hash(password) === result[0].password) && result[0].uid)) {
				callback(true);
			} else {
				callback(false, result[0].uid);
			}
		});
	},
	getDate: function (uid, vertex, callback) {
		fs.stat(devfsPath + '/' + uid + '/' + vertex, function (err, stat) {
			if (err) {
				callback(err);
			} else {
				callback(null, stat.mtime.getTime());
			}
		});
	},
	getData: function (uid, vertex, callback) {
		fs.readFile(devfsPath + '/' + uid + '/' + vertex, {encoding: 'utf8', flag: 'r'} , callback);
	},
	getMode: function (uid, vertex, callback) {
		fs.readFile(devfsPath + '/' + uid + '/attr/' + vertex + '/mode', {encoding: 'utf8', flag: 'r'} , callback);
	},
	getProfile: function (uid, vertex, callback) {
		fs.readFile(devfsPath + '/' + uid + '/attr/' + vertex + '/profile', {encoding: 'utf8', flag: 'r'} , callback);
	},
	getEdge: function (uid, vertex, callback) {
		fs.readdir(devfsPath + '/' + uid + '/edge/' + vertex, callback);
	},
	getVertex: function (uid, vertex, callback) {
		var count = 5;
		var result = {};
		function finish() {
			if ((--count) <= 0) callback(result);
		}
		actionHandler.getDate(uid, vertex, function (err, date) {
			if (!err) result.date = date;
			finish();
		});
		actionHandler.getData(uid, vertex, function (err, data) {
			if (!err) result.data = data;
			finish();
		});
		actionHandler.getMode(uid, vertex, function (err, mode) {
			if (!err) result.mode = mode;
			finish();
		});
		actionHandler.getProfile(uid, vertex, function (err, profile) {
			if (!err) result.profile = profile;
			finish();
		});
		actionHandler.getEdge(uid, vertex, function (err, edge) {
			if (!err) result.edge = edge;
			finish();
		});
	},
	list: function (uid, callback) {
		fs.readdir(devfsPath + '/' + uid + '/vertex', function (err, data) {
			if (err) {
				callback(err);
			} else {
				var count = data.length;
				var list = {};
				if (count == 0) {
					callback(null, list);
				} else {
					function finish(vertex, result) {
						list[vertex] = result;
						if ((--count) <= 0) callback(null, list);
					}
					for (var i in data) {
						actionHandler.getVertex(uid, data[i], finish.bind(null, data[i]));
					}
				}
			}
		});
	},
	getToday: function (uid, vertex, callback) {
		xattr.get(devfsPath + '/' + uid + '/' + vertex, 'today_20', callback);
	},
	enable: function (uid, vertex, callback) {
		xattr.set(devfsPath + '/' + uid + '/' + vertex, 'enable', '', callback);
	},
	disable: function (uid, vertex, callback) {
		xattr.set(devfsPath + '/' + uid + '/' + vertex, 'disable', '', callback);
	}
}

var watchList = {};

function startWebSocket(db) {
	webSocketServer = new WebSocketServer({port: 8090});
	webSocketServer.on('connection', function (webSocket) {
		function webSocketSend(message, debugStr) {
			var messageString = JSON.stringify(message);
			if (debugStr) {
				debugLog('Send: ' + debugStr);
			} else {
				debugLog('Send: ' + messageString);
			}
			webSocket.send(messageString);
		}
		var session = {id: randomId(), uid: '', path: '', watchState: false, webSocket: webSocket};
		
		webSocket.on('message', function (messageString) {
			debugLog('Client Said: ' + messageString);
			try { var message = JSON.parse(messageString); } catch (e) { return; }
			if (!(message && message.action)) return;
			if (message.action === 'auth') {
				if (message.user && message.password) {
					actionHandler[message.action](db, message.user, message.password, function (err, uid) {
						if (!err) {
							session.uid = uid;
							session.path = devfsPath + '/' + uid;
						}
						webSocketSend({action: message.action, err: err});
					});
				} else {
					webSocketSend({action: message.action, err: true});
				}
			} else if (session.uid) {
				if (message.action === 'list') {
					actionHandler[message.action](session.uid, function (err, list) {
						webSocketSend({action: message.action, err: Boolean(err), data: list},
									JSON.stringify({action: message.action, err: Boolean(err)}));
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
						if (message.action in actionHandler) {
							actionHandler[message.action](session.uid, message.vertex, function (err, data) {
								webSocketSend({action: message.action, vertex: message.vertex, err: Boolean(err), data: data});
							});
						}
					} else if ((message.action === 'enable') || (message.action === 'disable')) {
						actionHandler[message.action](session.uid, message.vertex, function (err) {
							webSocketSend({action: message.action, vertex: message.vertex, err: Boolean(err)});
						});
					}
				}
			}
		});
		
		webSocket.on('close', function () {
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
		
		webSocket.on('error', function () {
			debugLog("Error");
		});
	});
}

function scan(watch) {
	fs.readdir(watch.session.path, function (err, data) {
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
					actionHandler.list(watch.session.uid, function (err, list) {
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
				fs.stat(watch.session.path + '/' + vertex, function (err, data) {
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
	setInterval(function () {
		for (var i in watchList) {
			scan(watchList[i]);
		}
	}, 60000);
}
