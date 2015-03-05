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
	"golang.org/x/net/websocket"
	"gopkg.in/mgo.v2"
	"log"
	"net/http"
)

var c *mgo.Collection

func main() {
	session, err := mgo.Dial("localhost")
	if err != nil {
		panic(err)
	}
	defer session.Close()
	session.SetMode(mgo.Monotonic, true)
	c = session.DB("test").C("userdb")
	log.Println("Start")
	http.Handle("/", websocket.Handler(wsHandler))
	if err := http.ListenAndServe(":8091", nil); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
	log.Println("Stop")
}
