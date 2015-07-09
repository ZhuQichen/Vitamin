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

function debugLog(log) {
	if (DEBUG_FLAG) {
		process.stdout.write(new Date().toString() + ' ');
		console.log(log);
	}
}

function md5(str) {
	return crypto.createHash('md5').update(str).digest('hex');
}

var hash = md5;

var randomId = (function() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
	}
	return function() {
		return s4() + s4() + s4() + s4() + s4() + s4() + s4() + s4();
	};
})();

function testName(name) {
	return typeof(name) === 'string' && name.length === 32 && !!name.match(/^[0-9a-f]+$/);
}

function getUserPath(uid) {
	return DEVFS_PATH + '/' + uid;
}

function getDataPath(uid, vid) {
	return getUserPath(uid) + '/' + vid;
}

function getPropertyPath(uid, property) {
	return getUserPath(uid) + '/' + property;
}

function getVertexPropertyPath(uid, property, vid) {
	return getPropertyPath(uid, property) + '/' + vid;
}

function getVertexPropertyDstPath(uid, property, vid, dst) {
	return getVertexPropertyPath(uid, property, vid) + '/' + dst;
}

function getPath(uid, property, vid, dst) {
	if (property) {
		if (vid) {
			if (dst) {
				return getVertexPropertyDstPath(uid, property, vid, dst);
			} else {
				return getVertexPropertyPath(uid, property, vid);
			}
		} else {
			return getPropertyPath(uid, property);
		}
	} else {
		if (vid) {
			return getDataPath(uid, vid);
		} else {
			return getUserPath(uid);
		}
	}
}

function getEdgePath(uid, vid, dst) {
	return getPath(uid, 'edge', vid, dst);
}

function getVertexPath(uid, vid, dst) {
	return getPath(uid, 'vertex', vid, dst);
}

function getAttrPath(uid, vid, attr) {
	return getPath(uid, 'attr', vid, attr);
}

function createFile(path, callback) {
	fs.open(path, 'wx', 0644, function(err, fd){
		if (err) {
			if (err.code === 'EEXIST') {
				callback(false);
			} else {
				callback(err);
			}
		} else {
			fs.close(fd, callback);
		}
	});
}

function readText(path, callback) {
	fs.readFile(path, {encoding: 'utf8', flag: 'r'}, callback);
}

function writeText(path, text, callback) {
	fs.writeFile(path, text, {encoding: 'utf8', mode: 0644, flag: 'w'}, callback);
}

function readJSON(path, callback) {
	readText(path, function (err, data) {
		if (err) {
			callback(true);
		} else {
			try {
				var json = JSON.parse(data);
			} catch (e) {
				callback(true);
			}
			callback(false, json);
		}
	});
}