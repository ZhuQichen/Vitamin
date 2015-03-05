/*
 * Author: Zhu Qichen
 *
 * Copyright (C) 2015 Institute of Software, CAS <info@iscas.ac.cn>
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

package main

import (
	"crypto/md5"
	"encoding/hex"
	"io/ioutil"
	"os"
)

const (
	DEVFS_PATH = "/mnt/vdev"
)

func Hash(password string) string {
	hasher := md5.New()
	hasher.Write([]byte(password))
	return hex.EncodeToString(hasher.Sum(nil))
}

func GetUserPath(uid string) string {
	return DEVFS_PATH + "/" + uid
}

func GetDataPath(uid string, vid string) string {
	return GetUserPath(uid) + "/" + vid
}

func GetPropertyPath(uid string, property string) string {
	return GetUserPath(uid) + "/" + property
}

func GetVertexPropertyPath(uid string, property string, vid string) string {
	return GetPropertyPath(uid, property) + "/" + vid
}

func GetVertexPropertySubVertexPath(uid string, property string, vid string, subVid string) string {
	return GetVertexPropertyPath(uid, property, vid) + "/" + subVid
}

func GetPath(uid string, property string, vid string, subVid string) string {
	if property != "" {
		if vid != "" {
			if subVid != "" {
				return GetVertexPropertySubVertexPath(uid, property, vid, subVid)
			}
			return GetVertexPropertyPath(uid, property, vid)
		}
		return GetPropertyPath(uid, property)
	}
	if vid != "" {
		return GetDataPath(uid, vid)
	}
	return GetUserPath(uid)
}

func GetEdgePath(uid string, vid string, subVid string) string {
	return GetPath(uid, "edge", vid, subVid)
}

func GetVertexPath(uid string, vid string, subVid string) string {
	return GetPath(uid, "vertex", vid, subVid)
}

func GetAttrPath(uid string, vid string, attr string) string {
	return GetPath(uid, "attr", vid, attr)
}

func CreateFile(path string) error {
	file, err := os.OpenFile(path, os.O_CREATE, 0644)
	file.Close()
	return err
}

func ReadText(path string) (string, error) {
	text, err := ioutil.ReadFile(path)
	return string(text), err
}

func WriteText(path string, text string) error {
	return ioutil.WriteFile(path, []byte(text), 0644)
}
