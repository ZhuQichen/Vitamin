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
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"github.com/DHowett/go-xattr"
	"golang.org/x/net/websocket"
	"gopkg.in/mgo.v2"
	"gopkg.in/mgo.v2/bson"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
)

const (
	debugFlag = true
	devfsPath = "/mnt/vdev"
)

func hash(password string) string {
	hasher := md5.New()
	hasher.Write([]byte(password))
	return hex.EncodeToString(hasher.Sum(nil))
}

func getUserPath(uid string) string {
	return devfsPath + "/" + uid
}

func getDataPath(uid string, vertex string) string {
	return getUserPath(uid) + "/" + vertex
}

func getPropertyPath(uid string, property string) string {
	return getUserPath(uid) + "/" + property
}

func getVertexPropertyPath(uid string, property string, vertex string) string {
	return getPropertyPath(uid, property) + "/" + vertex
}

func getVertexPropertySubVertexPath(uid string, property string, vertex string, subVertex string) string {
	return getVertexPropertyPath(uid, property, vertex) + "/" + subVertex
}

func getPath(uid string, property string, vertex string, subVertex string) string {
	if property != "" {
		if vertex != "" {
			if subVertex != "" {
				return getVertexPropertySubVertexPath(uid, property, vertex, subVertex)
			}
			return getVertexPropertyPath(uid, property, vertex)
		}
		return getPropertyPath(uid, property)
	}
	if vertex != "" {
		return getDataPath(uid, vertex)
	}
	return getUserPath(uid)
}

func getEdgePath(uid string, vertex string, subVertex string) string {
	return getPath(uid, "edge", vertex, subVertex)
}

func getVertexPath(uid string, vertex string, subVertex string) string {
	return getPath(uid, "vertex", vertex, subVertex)
}

func getAttrPath(uid string, vertex string, attr string) string {
	return getPath(uid, "attr", vertex, attr)
}

func auth(user string, password string) (string, bool) {
	result := Users{}
	err := c.Find(bson.M{"user": user}).One(&result)
	if err != nil || hash(password) != result.Password {
		return "", true
	}
	return result.Uid, false
}

func getDate(uid string, vertex string) (int64, bool) {
	info, err := os.Stat(getDataPath(uid, vertex))
	if err != nil {
		return 0, true
	}
	return info.ModTime().Unix() * 1000, false
}

func getData(uid string, vertex string) (string, bool) {
	buf, err := ioutil.ReadFile(getDataPath(uid, vertex))
	if err != nil {
		return "", true
	}
	return string(buf), false
}

func getMode(uid string, vertex string) (string, bool) {
	buf, err := ioutil.ReadFile(getAttrPath(uid, vertex, "mode"))
	if err != nil {
		return "", true
	}
	return string(buf), false
}

func getProfile(uid string, vertex string) (string, bool) {
	buf, err := ioutil.ReadFile(getAttrPath(uid, vertex, "profile"))
	if err != nil {
		return "", true
	}
	return string(buf), false
}

func getEdge(uid string, vertex string) ([]string, bool) {
	list, err := ioutil.ReadDir(getEdgePath(uid, vertex, ""))
	if err != nil {
		return nil, true
	}
	strl := make([]string, len(list))
	for i := 0; i < len(list); i++ {
		strl[i] = list[i].Name()
	}
	return strl, false
}

type vt struct {
	Date    int64    `json:"date"`
	Data    string   `json:"data"`
	Mode    string   `json:"mode"`
	Profile string   `json:"profile"`
	Edge    []string `json:"edge"`
}

func getVertex(uid string, vertex string) (vt, bool) {
	var result vt
	result.Date, _ = getDate(uid, vertex)
	result.Data, _ = getData(uid, vertex)
	result.Mode, _ = getMode(uid, vertex)
	result.Profile, _ = getProfile(uid, vertex)
	result.Edge, _ = getEdge(uid, vertex)
	return result, false
}

func list(uid string) (map[string]vt, bool) {
	dir, err := ioutil.ReadDir(getVertexPath(uid, "", ""))
	if err != nil {
		return nil, true
	}
	result := make(map[string]vt)
	if len(dir) == 0 {
		return result, false
	}
	for i := 0; i < len(dir); i++ {
		d, _ := getVertex(uid, dir[i].Name())
		result[dir[i].Name()] = d
	}
	return result, false
}

func getToday(uid string, vertex string) (string, bool) {
	bt, err := xattr.Getxattr(getDataPath(uid, vertex), "today_24", 0, 0)
	if err != nil {
		return "", true
	}
	return string(bt), false
}

func enable(uid string, vertex string) bool {
	err := xattr.Setxattr(getDataPath(uid, vertex), "enable", []byte(""), 0, 0)
	if err != nil {
		return true
	}
	return false
}

func disable(uid string, vertex string) bool {
	err := xattr.Setxattr(getDataPath(uid, vertex), "disable", []byte(""), 0, 0)
	if err != nil {
		return true
	}
	return false
}

func createFile(path string) error {
	file, err := os.OpenFile(path, os.O_CREATE, 0644)
	if err != nil {
		return err
	}
	file.Close()
	return nil
}

func setRule(uid string, vertex string, data map[string]string) bool {
	handler := "def func(args):\n" +
		"\tr = (" + data["min"] + ", " + data["max"] + ")\n" +
		"\treal_args = args.values()[0]\n" +
		"\tval = float(real_args.values()[" + data["aspect"] + "])\n" +
		"\tif val >= r[0] and val <= r[1]:\n" +
		"\t\treturn {\"Enable\":True}\n"
	err := ioutil.WriteFile(getAttrPath(uid, vertex, "handler"), []byte(handler), 0644)
	if err != nil {
		return true
	}
	if vertex != data["dst"] {
		err1 := createFile(getEdgePath(uid, vertex, "") + "/" + data["dst"])
		if err1 != nil {
			return true
		}
		return false
	}
	return false
}

func setSync(uid string, vertex string, data bool) bool {
	orig, err := ioutil.ReadFile(getAttrPath(uid, vertex, "mode"))
	if err != nil {
		return true
	}
	mode, err1 := strconv.Atoi(string(orig))
	if err1 != nil {
		return true
	}
	if data {
		mode = mode/128*128 + mode%64 + 64
	} else {
		mode = mode/128*128 + mode%64
	}
	err2 := ioutil.WriteFile(getAttrPath(uid, vertex, "mode"), []byte(strconv.Itoa(mode)), 0644)
	if err2 != nil {
		return true
	}
	return false
}

var actionHandler map[string]interface{}

type Users struct {
	User     string
	Uid      string
	Password string
}

var c *mgo.Collection

type session struct {
	id         string
	uid        string
	path       string
	watchState bool
	webSocket  *websocket.Conn
}

func Send(s session, id string, err bool, data interface{}) {
	msg, _ := json.Marshal(map[string]interface{}{"sessionId": s.id, "id": id, "err": err, "data": data})
	err1 := websocket.Message.Send(s.webSocket, string(msg))
	if err1 != nil {
		log.Println(s.id, "wserror")
	}
}

type wsm struct {
	SessionId string      `json:"sessionId"`
	Id        string      `json:"id"`
	Action    string      `json:"action"`
	Vertex    string      `json:"vertex"`
	Data      interface{} `json:"data"`
}

func Wsh(ws *websocket.Conn) {
	var err error
	session := session{id: uuid.New(), uid: "", path: "", watchState: false, webSocket: ws}

	log.Println(session.id, "Connected")
	for {
		var msg string
		if err = websocket.Message.Receive(ws, &msg); err != nil {
			log.Println(session.id, "Can't receive")
			break
		}
		log.Println(session.id, "Received back from client: "+msg)
		var message wsm
		err := json.Unmarshal([]byte(msg), &message)
		if err != nil || message.Id == "" || message.Action == "" {
			continue
		}
		handler, hasAction := actionHandler[message.Action]
		if !hasAction {
			continue
		}
		if message.Action == "auth" {
			if message.Data == nil {
				Send(session, message.Id, true, nil)
				continue
			}
			ud, udok := message.Data.(map[string]interface{})
			if !udok {
				continue
			}
			us, uok := ud["user"]
			pd, pok := ud["password"]
			if !uok || !pok {
				continue
			}
			uid, autherr := auth(us.(string), pd.(string))
			if !autherr {
				session.uid = uid
				session.path = devfsPath + "/" + uid
			}
			Send(session, message.Id, autherr, nil)
		} else if session.uid != "" {
			if message.Action == "list" {
				lst, errlist := list(session.uid)
				Send(session, message.Id, errlist, lst)
				/*if (!session.watchState) {
					var date = {};
					for (var i in list) {
						date[i] = list[i].date;
					}
					addWatch(session, date, webSocketSend, message.id);
				}*/
			} else if message.Vertex != "" {
				if strings.Index(message.Action, "get") == 0 {
					gtd, gte := handler.(func(string, string) (interface{}, bool))(session.uid, message.Vertex)
					Send(session, message.Id, gte, gtd)
				} else if strings.Index(message.Action, "set") == 0 {
					if message.Data == nil {
						continue
					}
					ste := handler.(func(string, string, interface{}) bool)(session.uid, message.Vertex, message.Data)
					Send(session, message.Id, ste, nil)
				} else if message.Action == "enable" || message.Action == "disable" {
					ebe := handler.(func(string, string) bool)(session.uid, message.Vertex)
					Send(session, message.Id, ebe, nil)
				}
			}
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
	log.Println(session.id, "Disconnected")
}

func main() {
	actionHandler = map[string]interface{}{
		"auth":       auth,
		"getDate":    getDate,
		"getData":    getData,
		"getMode":    getMode,
		"getProfile": getProfile,
		"getEdge":    getEdge,
		"getVertex":  getVertex,
		"list":       list,
		"getToday":   getToday,
		"enable":     enable,
		"disable":    disable,
		"setRule":    setRule,
		"setSync":    setSync,
	}
	session, err := mgo.Dial("localhost")
	if err != nil {
		panic(err)
	}
	defer session.Close()
	session.SetMode(mgo.Monotonic, true)
	c = session.DB("test").C("userdb")
	log.Println("Start")
	http.Handle("/", websocket.Handler(Wsh))
	if err := http.ListenAndServe(":8091", nil); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
	log.Println("Stop")
}
