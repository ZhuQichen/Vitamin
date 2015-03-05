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
	"code.google.com/p/go-uuid/uuid"
	"encoding/json"
	"errors"
	"github.com/DHowett/go-xattr"
	"golang.org/x/net/websocket"
	"gopkg.in/mgo.v2/bson"
	"io/ioutil"
	"log"
	"os"
	"strconv"
)

type User struct {
	Username string `bson:"user"`
	Uid      string `bson:"uid"`
	Password string `bson:"password"`
}

func Auth(username, password string) (string, error) {
	user := User{}
	err := c.Find(bson.M{"user": username}).One(&user)
	if err != nil || Hash(password) != user.Password {
		return "", errors.New("authentication failure")
	}
	return user.Uid, nil
}

func GetDate(uid, vid string) (int64, error) {
	stat, err := os.Stat(GetDataPath(uid, vid))
	if err != nil {
		return 0, err
	}
	return stat.ModTime().Unix() * 1000, nil
}

func GetData(uid, vid string) (string, error) {
	return ReadText(GetDataPath(uid, vid))
}

func GetMode(uid, vid string) (int64, error) {
	text, err := ReadText(GetAttrPath(uid, vid, "mode"))
	if err != nil {
		return 0, err
	}
	return strconv.ParseInt(text, 10, 64)
}

func SetMode(uid string, vid string, mode int64) error {
	return WriteText(GetAttrPath(uid, vid, "mode"), strconv.FormatInt(mode, 10))
}

func GetProfile(uid, vid string) (string, error) {
	return ReadText(GetAttrPath(uid, vid, "profile"))
}

func GetEdges(uid, vid string) ([]string, error) {
	files, err := ioutil.ReadDir(GetEdgePath(uid, vid, ""))
	if err != nil {
		return nil, err
	}
	count := len(files)
	edges := make([]string, count)
	for i := 0; i < count; i++ {
		edges[i] = files[i].Name()
	}
	return edges, nil
}

type Vertex struct {
	Date    int64    `json:"date"`
	Data    string   `json:"data"`
	Mode    int64    `json:"mode"`
	Profile string   `json:"profile"`
	Edge    []string `json:"edge"`
}

func GetVertex(uid, vid string) (vertex Vertex, rerr error) {
	vertex.Date, _ = GetDate(uid, vid)
	vertex.Data, _ = GetData(uid, vid)
	vertex.Mode, _ = GetMode(uid, vid)
	vertex.Profile, _ = GetProfile(uid, vid)
	vertex.Edge, _ = GetEdges(uid, vid)
	return vertex, nil
}

func List(uid string) (vertexes map[string]Vertex, rerr error) {
	files, err := ioutil.ReadDir(GetVertexPath(uid, "", ""))
	if err != nil {
		return nil, err
	}
	count := len(files)
	if count == 0 {
		return vertexes, nil
	}
	for i := 0; i < count; i++ {
		vertex, _ := GetVertex(uid, files[i].Name())
		vertexes[files[i].Name()] = vertex
	}
	return vertexes, nil
}

func GetToday(uid, vid string) (string, error) {
	today, err := xattr.Getxattr(GetDataPath(uid, vid), "today_24", 0, 0)
	return string(today), err
}

func SetHandler(uid, vid, min, max, aspect string) error {
	handler := "def func(args):\n" +
		"\tr = (" + min + ", " + max + ")\n" +
		"\treal_args = args.values()[0]\n" +
		"\tval = float(real_args.values()[" + aspect + "])\n" +
		"\tif val >= r[0] and val <= r[1]:\n" +
		"\t\treturn {\"Enable\":True}\n"
	return WriteText(GetAttrPath(uid, vid, "handler"), handler)
}

func AddEdge(uid, vid, subVid string) error {
	return CreateFile(GetEdgePath(uid, vid, subVid))
}

type Rule struct {
	Min    string `json:"min"`
	Max    string `json:"max"`
	Aspect string `json:"aspect"`
	Dst    string `json:"dst"`
}

func SetRule(uid, vid string, rule Rule) error {
	if err := SetHandler(uid, vid, rule.Min, rule.Max, rule.Aspect); err != nil {
		return err
	}
	if vid != rule.Dst {
		if err := AddEdge(uid, vid, rule.Dst); err != nil {
			return err
		}
	}
	return nil
}

func SetSync(uid, vid string, enabled bool) error {
	mode, err := GetMode(uid, vid)
	if err != nil {
		return err
	}
	mode = mode/128*128 + mode%64
	if enabled {
		mode += 64
	}
	return SetMode(uid, vid, mode)
}

func SetState(uid, vid, state string) error {
	return xattr.Setxattr(GetDataPath(uid, vid), state, []byte(""), 0, 0)
}

type Session struct {
	Id         string
	Uid        string
	Path       string
	WatchState bool
	WebSocket  *websocket.Conn
}

type Message struct {
	Sid    string      `json:"sessionId"`
	Id     string      `json:"id"`
	Action string      `json:"action"`
	Vid    string      `json:"vertex"`
	Data   interface{} `json:"data"`
}

type AuthData struct {
	Username string `json:"user"`
	Password string `json:"password"`
}

func wsHandler(ws *websocket.Conn) {
	var err error
	var res interface{}
	session := Session{
		Id:         uuid.New(),
		Uid:        "",
		Path:       "",
		WatchState: false,
		WebSocket:  ws,
	}
	log.Println(session.Id, "Connected")
	for {
		var message Message
		if websocket.JSON.Receive(ws, &message) != nil {
			break
		}
		log.Println(session.Id, "Received:", message)
		if message.Action != "auth" && session.Uid == "" {
			continue
		}
		switch message.Action {
		case "auth":
			if message.Data == nil {
				continue
			}
		case "setRule", "setSync":
			if message.Data == nil || message.Vid == "" {
				continue
			}
		case "getDate", "getData", "getMode", "getProfile", "getEdge", "getVertex", "getToday", "enable", "disable":
			if message.Vid == "" {
				continue
			}
		}
		res = nil
		switch message.Action {
		case "auth":
			var authDataJson []byte
			authDataJson, err = json.Marshal(message.Data)
			if err != nil {
				continue
			}
			var authData AuthData
			if err = json.Unmarshal(authDataJson, &authData); err != nil {
				continue
			}
			res, err = Auth(authData.Username, authData.Password)
			if err == nil {
				session.Uid = res.(string)
				session.Path = DEVFS_PATH + "/" + res.(string)
			}
		case "list":
			res, err = List(session.Uid)
			/*if (!session.watchState) {
				var date = {};
				for (var i in list) {
					date[i] = list[i].date;
				}
				addWatch(session, date, webSocketSend, message.id);
			}*/
		case "getDate":
			res, err = GetDate(session.Uid, message.Vid)
		case "getData":
			res, err = GetData(session.Uid, message.Vid)
		case "getMode":
			res, err = GetMode(session.Uid, message.Vid)
		case "getProfile":
			res, err = GetProfile(session.Uid, message.Vid)
		case "getEdge":
			res, err = GetEdges(session.Uid, message.Vid)
		case "getVertex":
			res, err = GetVertex(session.Uid, message.Vid)
		case "getToday":
			res, err = GetToday(session.Uid, message.Vid)
		case "setRule":
			var ruleJson []byte
			ruleJson, err = json.Marshal(message.Data)
			if err != nil {
				continue
			}
			var rule Rule
			if err = json.Unmarshal(ruleJson, &rule); err != nil {
				continue
			}
			err = SetRule(session.Uid, message.Vid, rule)
		case "setSync":
			enabled, ok := message.Data.(bool)
			if !ok {
				continue
			}
			err = SetSync(session.Uid, message.Vid, enabled)
		case "enable", "disable":
			err = SetState(session.Uid, message.Vid, message.Action)
		}
		resMessage := make(map[string]interface{})
		resMessage["sessionId"] = session.Id
		resMessage["id"] = message.Id
		if err != nil {
			log.Println(session.Id, err)
			resMessage["err"] = true
		}
		if res != nil {
			resMessage["data"] = res
		}
		if websocket.JSON.Send(ws, resMessage) != nil {
			log.Println(session.Id, "Can't send")
		}
	}
	/*if (session.uid in watchList) {
		if (session.id in watchList[session.uid].send) {
			delete watchList[session.uid].send[session.id];
			if (Object.keys(watchList[session.uid].send).length == 0) {
				delete watchList[session.uid];
			}
		}
	}*/
	log.Println(session.Id, "Disconnected")
}
