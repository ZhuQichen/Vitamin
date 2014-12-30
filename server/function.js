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
	if (debugFlag) {
		process.stdout.write(new Date().toString());
		console.log(log);
	}
}

function md5(str) {
	return crypto.createHash('md5').update(str).digest('hex');
};

var hash = md5;

var randomId = (function() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
	}
	return function() {
		return s4() + s4() + s4() + s4() + s4() + s4() + s4() + s4();
	};
})();

function createFile(path, callback) {
	fs.open(path, 'wx', 0644, function(err, fd){
		if (err) {
			callback(err);
		} else {
			fs.close(fd, callback);
		}
	});
}

function parseName(name) {
	if (typeof(name) === 'string' && name.length === 32 && name.match(/^[0-9a-f]+$/)) {
		return name;
	} else {
		throw 'NameError';
	}
}

function getUserPath(uid) {
	return devfsPath + '/' + uid;
}

function getPath(uid, property, vertex, subVertex) {
	if (typeof(property) === 'undefined') {
		if (typeof(vertex) === 'undefined') {
			return getUserPath(uid);
		} else {
			return getUserPath(uid) + '/' + vertex;
		}
	} else {
		if (typeof(vertex) === 'undefined') {
			return getUserPath(uid) + '/' + property;
		} else {
			if (typeof(subVertex) === 'undefined') {
				return getUserPath(uid) + '/' + property + '/' + vertex;
			} else {
				return getUserPath(uid) + '/' + property + '/' + vertex + '/' + dstVertex;
			}
		}
	}
}

function getDataPath(uid, vertex) {
	return getPath(uid, null, vertex);
}

function getEdgePath(uid, vertex, subVertex) {
	getPath(uid, 'edge', vertex, subVertex);
}
function getVertexPath(uid, vertex) {
	getPath(uid, 'vertex', vertex, subVertex);
}

function getAttrPath(uid, vertex, attr) {
	getPath(uid, 'attr', vertex, attr);
}