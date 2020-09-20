const xss = require("xss")
const express = require('express')
const http = require('http')
const cors = require('cors')
const secure = require('express-secure-only')
const app = express()
const bodyParser = require('body-parser')
const path = require("path")

const translateText = require("./text-translation").translateText

var server = http.createServer(app)
var io = require('socket.io')(server)

app.use(secure())
app.use(cors())
app.use(bodyParser.json())

app.enable('trust proxy')

const { IamTokenManager } = require('ibm-watson/auth')
var serviceUrl = "https://api.eu-gb.speech-to-text.watson.cloud.ibm.com/instances/f99b2b12-d43c-4275-ac49-11387f2cf394" 
const sttAuthenticator = new IamTokenManager({
    apikey: ""
})

// speech to text token endpoint
app.get('/speech-to-text-token', async (req, res) => {
	const accessToken = await sttAuthenticator.getToken()
	res.status(200).send({
        accessToken,
        serviceUrl
	})
})

if(process.env.NODE_ENV==='production'){
	app.use(express.static(__dirname+"/build"))
	app.get("*", (req, res) => {
		res.sendFile(path.join(__dirname+"/build/index.html"))
	})
}

getRoomSocket = (id) => {
	for (const [k, v] of Object.entries(connections)) {
		for(let a = 0; a < v.length; ++a){
			if(v[a] === id){
				return k
			}
		}
	}
	return null
}

getPeople = (socket) => {
	var key = getRoomSocket(socket.id)
	if(key){
		let roomPeople = []
		if(people[key] !== undefined){
			roomPeople = people[key]
		}
		io.to(socket.id).emit("get-people-reply", JSON.stringify(roomPeople))
	}
}

getTranslationRoom = (path) => {
	let languages = new Set()
	for(let a = 0; a < connections[path].length; ++a){
		languages.add(peopleLanguage[connections[path][a]])
	}

	var promises = []
	for(let language of languages.values()) {
		for(let b = 0; b < translations[path].length; ++b) {
			promises.push(translateText(translations[path][b], language))
		}
	}

	Promise.all(promises).then((values) => {
		let result = values.reduce(function (r, a) {
			r[a.target] = r[a.target] || []
			r[a.target].push(a)
			return r
		}, Object.create(null))

		for(let a = 0; a < connections[path].length; ++a){
			let currLang = peopleLanguage[connections[path][a]]
			let currRes = result[[currLang]]
			let finalResult = []
			
			if(!currRes) continue

			for(let b = 0; b < currRes.length; ++b){
				finalResult.push({
					transcript: currRes[b]["translation"],
					sender: currRes[b]["sender"],
					date: currRes[b]["date"]
				})
			}
			io.to(connections[path][a]).emit("get-translate-reply", JSON.stringify(finalResult))
		}
	})
}

sendComminities = (socketId) => {
	io.to(socketId).emit("get-communities-reply", JSON.stringify(communities))
}

people = {}
peopleLanguage = {}
messages = {}
translations = {}
connections = {}
communities = {}
homeConnections = []

setInterval(() => {
	for (let path of Object.keys(communities)) {
		if(path in connections) {
			communities[path].partecipants = connections[path].length
		} else {
			communities[path].partecipants = 0
		}
	}

	for(let a = 0; a < homeConnections.length; ++a) {
		sendComminities(homeConnections[a])
	} 
}, 1000)


io.on('connection', (socket) => {
	socket.on('join-call', (path, username) => {
		if(connections[path] === undefined){
			connections[path] = []
		}
		if(people[path] === undefined){
			people[path] = []
		}
		if(translations[path] === undefined){
			translations[path] = []
		}

		connections[path].push(socket.id)
		
		people[path].push({
			idSocket: socket.id,
			username: username
		})

		peopleLanguage[socket.id] = "en-US"

		for(let a = 0; a < connections[path].length; ++a){
			io.to(connections[path][a]).emit("user-joined", socket.id, username, connections[path])
		}

		if(messages[path] !== undefined){
			for(let a = 0; a < messages[path].length; ++a){
				io.to(socket.id).emit("chat-message", messages[path][a]['data'], 
					messages[path][a]['sender'], messages[path][a]['socket-id-sender'])
			}
		}

		getPeople(socket)
	})

	socket.on('signal', (toId, message) => {
		io.to(toId).emit('signal', socket.id, message)
	})

	socket.on('chat-message', (data, sender) => {
		data = xss(data)
		sender = xss(sender)
		sender = sender.length <= 20 ? sender : sender.substring(0, 18) + "..."

		var key = getRoomSocket(socket.id)
		if(key){
			if(messages[key] === undefined){
				messages[key] = []
			}
			messages[key].push({"sender": sender, "data": data, "socket-id-sender": socket.id})

			for(let a = 0; a < connections[key].length; ++a){
				io.to(connections[key][a]).emit("chat-message", data, sender, socket.id)
			}
		}
	})

	socket.on('emoji', (emoji, sender, date) => {
		var key = getRoomSocket(socket.id)
		if(key){
			for(let a = 0; a < connections[key].length; ++a){
				io.to(connections[key][a]).emit("emoji", emoji, sender, date)
			}
		}
	})

	socket.on('new-translation', (transcript, languageKey, sender, date) => {
		var key = getRoomSocket(socket.id)
		if(key){
			translations[key].push({
				transcript,
				languageKey,
				sender,
				date
			})

			getTranslationRoom(key)
		}
	})

	socket.on('change-language', (language) => {
		peopleLanguage[socket.id] = language

		var key = getRoomSocket(socket.id)
		if(key){
			getTranslationRoom(key)
		}
	})

	socket.on('get-chat', () => {
		var key = getRoomSocket(socket.id)
		if(key){
			let roomMessages = []
			if(messages[key] !== undefined){
				for(let a = 0; a < messages[key].length; ++a){
					roomMessages.push({
						data: messages[key][a]['data'], 
						sender: messages[key][a]['sender'], 
						idSender: messages[key][a]['socket-id-sender']
					})
				}
			}
			io.to(socket.id).emit("get-chat-reply", JSON.stringify(roomMessages))
		}
	})
	socket.on('get-people', () => {
		getPeople(socket)
	})
	socket.on('get-translate', () => {
		var key = getRoomSocket(socket.id)
		if(key){
			io.to(socket.id).emit("get-translate-reply", JSON.stringify(translations[key]))
		}
	})

	socket.on('join-home', () => {
		homeConnections.push(socket.id)
	})

	socket.on('create-community', (path, title) => {
		communities[path] = {
			path: path,
			title: title,
			partecipants: 0,
		}
		sendComminities(socket.id)
	})

	socket.on('get-communities', () => {
		sendComminities(socket.id)
	})

	socket.on('disconnect', () => {
		if(homeConnections.includes(socket.id)) {
			let index = homeConnections.indexOf(socket.id)
			homeConnections.splice(index, 1)
			return
		}
		var key
		for (const [k, v] of JSON.parse(JSON.stringify(Object.entries(connections)))) {
			for(let a = 0; a < v.length; ++a){
				if(v[a] === socket.id){
					key = k

					for(let a = 0; a < connections[key].length; ++a){
						io.to(connections[key][a]).emit("user-left", socket.id)
					}
			
					var index = connections[key].indexOf(socket.id)
					connections[key].splice(index, 1)
					if(connections[key].length === 0){
						delete connections[key]
					}

					var index2 = people[key].map(item => item.idSocket).indexOf(socket.id)
					people[key].splice(index2, 1)
					if(people[key].length === 0){
						delete people[key]
					}

					getPeople(socket)
				}
			}
		}
	})
})

app.set('port', (process.env.PORT || 9001))
server.listen(app.get('port'), () => {
	console.log("listening on", app.get('port'))
})