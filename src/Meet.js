import React, { Component } from 'react'
import { IconButton, Badge, Input, Button, Divider, FormControl, InputLabel, Select, MenuItem } from '@material-ui/core'
import MenuIcon from '@material-ui/icons/Menu';
import ChatIcon from '@material-ui/icons/Chat'
import TranslateIcon from '@material-ui/icons/Translate'
import InsertEmoticonIcon from '@material-ui/icons/InsertEmoticon'
import PeopleIcon from '@material-ui/icons/People'
import SendIcon from '@material-ui/icons/Send'

import { message } from 'antd'
import 'antd/dist/antd.css'
import { Row } from 'reactstrap'
import 'bootstrap/dist/css/bootstrap.css'

import io from 'socket.io-client'
import { Picker } from 'emoji-mart'
import 'emoji-mart/css/emoji-mart.css'
import faker from "faker"
import recognizeMicrophone from 'watson-speech/speech-to-text/recognize-microphone'
import "./style.css"

const serverUrl = process.env.NODE_ENV === 'production' ? 'https://hackmit.sebastienbiollo.com' : 'http://localhost:9001'

const iceServer = {'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }]}
var clientConnected = {}
var socket = null
var socketId = null
var numClientConnected = 0

var languages = {
	"ar-AR": "Arabic",
	"pt-BR": "Brazilian Portuguese",
	"zh-CN": "Chinese (Mandarin)",
	"nl-NL": "Dutch",
	"en-US": "English",
	"fr-FR": "French",
	"de-DE": "German",
	"it-IT": "Italian",
	"ja-JP": "Japanese",
	"ko-KR": "Korean",
	"es-ES": "Spanish (Castilian)"
}
var languagesKeys = Object.keys(languages)
var microphoneWatson

class Meet extends Component {
	constructor(props) {
		super(props)

		this.state = {
			media: false,
			message: "",
			newmessages: 0,
			askForUsername: true,
			username: faker.internet.userName(),
			isMobile: window.matchMedia("only screen and (max-width: 760px)").matches,
			showPickEmoji: false,
			lastEmojiSent: 0,
			showRightBox: false,
			typeRightBox: "chat", // "chat", "people", "translate"
			messages: [],
			people: [],
			translations: [],
			yourLanguageKey: "en-US",
			yourLanguage: "English",
			tokenWatsonAPI: null,
		}
		this.myVideo = React.createRef()

		this.getPermissions()
	}

	setLanguageForWatson = () => {
		if(microphoneWatson !== null) {
			try {
				microphoneWatson.stop()
			} catch(e) {}
			microphoneWatson = null
		}
		if(this.state.tokenWatsonAPI === null) return

		let token = this.state.tokenWatsonAPI
		let language = this.state.yourLanguageKey + "_BroadbandModel"
		microphoneWatson = recognizeMicrophone(Object.assign({
			accessToken: token.accessToken,
			model: language,
			keepMicrophone: true,
			inactivity_timeout: 99999999999999,
			smart_formatting: true,
			format: true,
			objectMode: true,
			url: token.serviceUrl,
		}))
		microphoneWatson.on('data', (data) => {
			console.log(data)
			let now = new Date().getTime()

			data = data['results']
			if(data.length > 0) {
				data = data[data.length-1]

				if(data.final === true) {
					let transcript = data['alternatives'][0]['transcript']
					socket.emit("new-translation", transcript, this.state.yourLanguageKey, this.state.username, now)
				}
			}
		})
		microphoneWatson.on('error', function(err) {
			console.error(err)
		})
	}

	watsonAPI = () => {
		if(this.state.tokenWatsonAPI === null) {
			fetch(serverUrl + '/speech-to-text-token', {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
				},
			})
				.then(token => token.json())
				.then((token) => {
					this.setState({
						tokenWatsonAPI: token
					}, () => {
						this.setLanguageForWatson()
					})
				}).catch(function(error) {
					console.error(error)
				})
		} else {
			this.setLanguageForWatson()
		}
	}

	getPermissions = async () => {
		try {
			await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
				.then((stream) => {
					this.watsonAPI()
					this.setState({ media: true })
				})
				.catch(() => this.setState({ media: false }))

			if (this.state.media) {
				navigator.mediaDevices.getUserMedia({ video: true, audio: true })
					.then((stream) => {
						window.localStream = stream
						this.myVideo.current.srcObject = stream
					})
					.then((stream) => { })
					.catch((e) => console.error(e))
			} else {
				message.error("You must share both camera and microphone")
			}
		} catch (e) { console.error(e) }
	}

	getUserMedia = () => {
		if (this.state.media) {
			navigator.mediaDevices.getUserMedia({ video: true, audio: true })
				.then(this.getUserMediaSuccess)
				.then((stream) => { })
				.catch((e) => console.error(e))
		}
	}

	getUserMediaSuccess = (stream) => {
		try {
			window.localStream.getTracks().forEach(track => track.stop())
		} catch (e) { console.error(e) }

		window.localStream = stream
		this.myVideo.current.srcObject = stream

		for (let id in clientConnected) {
			if (id === socketId) continue

			clientConnected[id].addStream(window.localStream)

			clientConnected[id].createOffer().then((description) => {
				clientConnected[id].setLocalDescription(description)
					.then(() => {
						socket.emit('signal', id, JSON.stringify({ 'sdp': clientConnected[id].localDescription }))
					})
					.catch(e => console.error(e))
			})
		}
	}

	gotMessageFromServer = (fromId, message) => {
		var signal = JSON.parse(message)

		if (fromId !== socketId) {
			if (signal.sdp) {
				clientConnected[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
					if (signal.sdp.type === 'offer') {
						clientConnected[fromId].createAnswer().then((description) => {
							clientConnected[fromId].setLocalDescription(description).then(() => {
								socket.emit('signal', fromId, JSON.stringify({ 'sdp': clientConnected[fromId].localDescription }))
							}).catch(e => console.error(e))
						}).catch(e => console.error(e))
					}
				}).catch(e => console.error(e))
			}

			if (signal.ice) {
				clientConnected[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.error(e))
			}
		}
	}

	changeCssVideos = (main) => {
		let widthMain = main.offsetWidth
		let minWidth = "30%"
		if ((widthMain * 30 / 100) < 300) {
			minWidth = "300px"
		}
		let minHeight = "40%"

		let height = String(100 / numClientConnected) + "%"
		let width = ""
		if (numClientConnected === 0 || numClientConnected === 1) {
			width = "100%"
			height = "100%"
		} else if (numClientConnected === 2) {
			width = "45%"
			height = "100%"
		} else if (numClientConnected === 3 || numClientConnected === 4) {
			width = "35%"
			height = "50%"
		} else {
			width = String(100 / numClientConnected) + "%"
		}

		if(this.state.isMobile === true) {
			height = "50%"
		}

		let videos = main.querySelectorAll("video")
		for (let a = 0; a < videos.length; ++a) {
			videos[a].style.minWidth = minWidth
			videos[a].style.minHeight = minHeight
			videos[a].style.setProperty("width", width)
			videos[a].style.setProperty("height", height)
		}

		return { minWidth, minHeight, width, height }
	}

	connectToSocketServer = () => {
		socket = io.connect(serverUrl)

		socket.on('signal', this.gotMessageFromServer)

		socket.on('connect', () => {
			socket.emit('join-call', window.location.href, this.state.username)
			socketId = socket.id

			socket.on('chat-message', this.addMessage)

			socket.on('emoji', this.addEmoji)

			socket.on('get-chat-reply', (data) => {
				this.setState({
					messages: JSON.parse(data)
				})
			})
			socket.on('get-people-reply', (data) => {
				this.setState({
					people: JSON.parse(data)
				})
			})
			socket.on('get-translate-reply', (data) => {
				data = JSON.parse(data)
				data.sort((a, b) => (a.date > b.date) ? 1 : -1)

				this.setState({
					translations: data
				})
			})

			socket.on('user-left', (id) => {
				let video = document.querySelector(`[data-socket="${id}"]`)
				if (video !== null) {
					numClientConnected--
					video.parentNode.removeChild(video)

					let main = document.getElementById('main')
					this.changeCssVideos(main)
				}
			})

			socket.on('user-joined', (id, username, clients) => {
				clients.forEach((socketListId) => {
					clientConnected[socketListId] = new RTCPeerConnection(iceServer)
					clientConnected[socketListId].onicecandidate = function (event) {
						if (event.candidate != null) {
							socket.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }))
						}
					}

					clientConnected[socketListId].onaddstream = (event) => {
						var searchVideo = document.querySelector(`[data-socket="${socketListId}"]`)
						if (searchVideo !== null) {
							searchVideo.srcObject = event.stream
						} else {
							numClientConnected = clients.length
							let main = document.getElementById('main')
							let cssMesure = this.changeCssVideos(main)

							let video = document.createElement('video')

							let css = {
								minWidth: cssMesure.minWidth, minHeight: cssMesure.minHeight, 
								maxHeight: "100%", margin: "10px", objectFit: "fill"
							}
							for (let i in css) video.style[i] = css[i]

							video.style.setProperty("width", cssMesure.width)
							video.style.setProperty("height", cssMesure.height)
							video.setAttribute('data-socket', socketListId)
							video.setAttribute('username', username)

							video.srcObject = event.stream
							video.autoplay = true
							video.playsinline = true

							main.appendChild(video)
						}
					}

					if (window.localStream !== undefined && window.localStream !== null) {
						clientConnected[socketListId].addStream(window.localStream)
					}
				})

				if (id === socketId) {
					for (let id2 in clientConnected) {
						if (id2 === socketId) continue

						try {
							clientConnected[id2].addStream(window.localStream)
						} catch (e) { }

						clientConnected[id2].createOffer().then((description) => {
							clientConnected[id2].setLocalDescription(description)
								.then(() => {
									socket.emit('signal', id2, JSON.stringify({ 'sdp': clientConnected[id2].localDescription }))
								})
								.catch(e => console.error(e))
						})
					}
				}
			})
		})
	}

	openChat = () => this.setState({ showRightBox: true })
	closeChat = () => this.setState({ showRightBox: false })
	handleMessage = (e) => this.setState({ message: e.target.value })

	addMessage = (data, sender, socketIdSender) => {
		this.setState(prevState => ({
			messages: [...prevState.messages, { "sender": sender, "data": data }],
		}))
		if (socketIdSender !== socketId && this.state.typeRightBox !== "chat") {
			this.setState({ newmessages: this.state.newmessages + 1 })
		}
	}

	addEmoji = (emoji, sender, date) => {
		var divEmojis = document.getElementById("emojis")

		var div = document.createElement("div")
		div.className = "emoji"
		div.style.left = (parseInt(Math.random() * 75, 10)).toString() + "%"
		div.style.top = (parseInt(Math.random() * 70, 10)).toString() + "%"
		div.innerHTML = emoji
		var id = parseInt(Math.random() * 100000, 10)
		div.setAttribute('emoji-id', id)
		div.style.width = "auto"
		
		var p = document.createElement("p")
		p.style.color = "white"
		p.style.background = "#616161"
		p.style.borderRadius = "30px"
		p.style.paddingLeft = "5px"
		p.style.paddingRight = "5px"
		p.innerHTML = sender.length <= 10 ? sender : sender.substring(0, 8) + "..."

		var currSize = 40
		var currSizeName = 10
		div.style.fontSize = currSize.toString() + "px"
		p.style.fontSize = currSizeName.toString() + "px"

		var interval = setInterval((div, id) => {
			// if you switch tab, and seconds goes, don't show the emoji
			if (currSize === 12 || Math.abs(date - new Date().getTime()) > 3000) {
				var child = document.querySelector(`[emoji-id="${id}"]`)
				document.getElementById("emojis").removeChild(child)
				clearInterval(interval)
			}

			currSize--
			div.style.fontSize = currSize.toString() + "px"
		}, 80, div, id)

		div.append(p)
		divEmojis.append(div)
	}

	sendEmoji = (emoji) => {
		let now = new Date().getTime()
		if (Math.abs(this.state.lastEmojiSent - now) < 2000) {
			return
		}
		this.setState({
			lastEmojiSent: now
		})
		socket.emit("emoji", emoji, this.state.username, now)
	}

	handleUsername = (e) => this.setState({ username: e.target.value })

	sendMessage = () => {
		if (this.state.message.length === 0) return
		socket.emit('chat-message', this.state.message, this.state.username)
		this.setState({ message: "" })
	}

	ClipboardInviteLink = () => {
		let text = window.location.href
		if (!navigator.clipboard) {
			let textArea = document.createElement("textarea")
			textArea.value = text
			document.body.appendChild(textArea)
			textArea.focus()
			textArea.select()
			try {
				document.execCommand('copy')
				message.success("Link copied to clipboard!")
			} catch (err) {
				message.error("Failed to copy")
			}
			document.body.removeChild(textArea)
			return
		}
		navigator.clipboard.writeText(text).then(function () {
			message.success("Link copied to clipboard!")
		}, () => {
			message.error("Failed to copy")
		})
	}

	connect = () => {
		if(this.state.media === false) {
			message.error("You must share both camera and microphone")
			return
		}
		this.setState({ askForUsername: false }, () => {
			this.getUserMedia()
			this.connectToSocketServer()
		})
	}

	isChrome = () => {
		let userAgent = (navigator && (navigator.userAgent || '')).toLowerCase()
		let vendor = (navigator && (navigator.vendor || '')).toLowerCase()
		let matchChrome = /google inc/.test(vendor) ? userAgent.match(/(?:chrome|crios)\/(\d+)/) : null
		return matchChrome !== null
	}

	render() {
		if(this.isChrome() === false) {
			return (
				<div style={{
					background: "white", width: "30%", height: "auto", padding: "20px", minWidth: "400px",
					textAlign: "center", margin: "auto", marginTop: "50px", justifyContent: "center"
				}}>
					<h1>Sorry, this works only with Google Chrome</h1>
				</div>
			)
		}
		return (
			<div>
				{this.state.askForUsername === true ?
					<div style={{ 
						paddingTop: "30px", margin: "auto", alignItems: "center",
						justifyContent: "center", textAlign: "center"
					}}>
						<div style={{ 
							background: "whitesmoke", width: "30%", height: "auto", padding: "20px", 
							minWidth: "400px", textAlign: "center", margin: "auto", marginTop: "30px", borderRadius: "10px"
						}}>
							<p style={{ margin: 0, fontWeight: "bold" }}>Set your username</p>
					 		<Input placeholder="Username" value={this.state.username} onChange={e => this.handleUsername(e)} />
					 		<Button variant="contained" color="primary" onClick={this.connect} style={{ margin: "20px" }}>Connect</Button>
						</div>
						<div style={{ justifyContent: "center", textAlign: "center", paddingTop: "40px" }}>
							<video id="my-video" ref={this.myVideo} autoPlay muted style={{
								objectFit: "fill", width: "400px", height: "400px"
							}}></video>
						</div>
					</div>
					:
					<div>
						<div style={{ display: this.state.showRightBox === false ? "block" : "none", 
								width: this.state.isMobile === true ? "100%" : "calc(100% - 350px)", 
								height: "100%", position: "absolute" }}>
							<div id="container" className="container">
								<Row id="main" className="flex-container" style={{ margin: 0, padding: 0 }}>
									<video id="my-video" ref={this.myVideo} autoPlay muted style={{
										margin: "10px", objectFit: "fill", width: "100%", 
										height: this.state.isMobile === true ? "50%" : "100%"
									}}></video>
								</Row>
							</div>
						</div>

						{this.state.isMobile === true && this.state.showRightBox === false &&
							<IconButton style={{ color: "#424242", display: "absolute", left: "0" }} 
								onClick={this.openChat}>
								<MenuIcon />
							</IconButton>}

						{(this.state.isMobile === false || (this.state.isMobile === true && this.state.showRightBox === true)) &&
							<div style={{ width: (this.state.isMobile === true && this.state.showRightBox === true) ? "100%" : "350px", 
								// height: "auto !important", 
								display: "flex", flexFlow: "column", height: "100%",
								position: "absolute", background: "white", right: "0px", zIndex: 10,
								boxShadow: "0px 3px 1px -2px rgba(0,0,0,0.2), 0px 2px 2px 0px rgba(0,0,0,0.14), 0px 1px 5px 0px rgba(0,0,0,0.12)" }}>
								
								{this.state.isMobile === true && <p className="close" onClick={this.closeChat}>X</p>}

								<div style={{flex: "0 1 auto"}}>
									<div style={{ paddingTop: "20px" }}>
										<Button style={{
											backgroundColor: "#3f51b5", color: "whitesmoke",
											marginTop: "10px", fontSize: "10px"
										}} onClick={this.ClipboardInviteLink}>Copy invite link</Button>

										<Row className="flex-container" style={{ margin: "0px", padding: "0px", marginTop: "10px" }}>
											<span role="img" aria-label="hello" className="emoji2" onClick={() => this.sendEmoji("👋")}>👋</span>
											<span role="img" aria-label="good" className="emoji2" onClick={() => this.sendEmoji("👍")}>👍</span>
											<span role="img" aria-label="bad" className="emoji2" onClick={() => this.sendEmoji("👎")}>👎</span>
											<span role="img" aria-label="laugh" className="emoji2" onClick={() => this.sendEmoji("😂")}>😂</span>
											<span role="img" aria-label="love" className="emoji2" onClick={() => this.sendEmoji("❤️")}>❤️</span>
											<span role="img" aria-label="crab" className="emoji2" onClick={() => this.sendEmoji("🦀")}>🦀</span>
										</Row>
									</div>

									<Divider style={{ marginTop: "10px", marginBottom: "10px" }} />

									<div>
										<div style={{ color: "whitesmoke", textAlign: "center" }}>
											<Badge badgeContent={this.state.newmessages} max={999} color="secondary">
												<IconButton style={{ color: this.state.typeRightBox === "chat" ? "#3f51b5" : "#424242", margin: "5px" }} 
													onClick={() => {
														this.setState({
															typeRightBox: "chat",
															newmessages: 0
														})
														socket.emit("get-chat")
													}}>
													<ChatIcon />
												</IconButton>
											</Badge>
											<IconButton style={{ color: this.state.typeRightBox === "people" ? "#3f51b5" : "#424242", margin: "5px" }} 
												onClick={() => {
													this.setState({
														typeRightBox: "people"
													})
													socket.emit("get-people")
												}}>
												<PeopleIcon />
											</IconButton>
											<IconButton style={{ color: this.state.typeRightBox === "translate" ? "#3f51b5" : "#424242", margin: "5px" }} 
												onClick={() => {
													this.setState({
														typeRightBox: "translate"
													})
													socket.emit("get-translate")
												}}>
												<TranslateIcon />
											</IconButton>
										</div>
									</div>
								</div>
								
								{this.state.typeRightBox === "chat" && 
									<div style={{ flex: "1 1 auto", overflow: "auto", overflowY: "auto", marginLeft: "20px" }}>
										<h3 style={{ marginBottom: "10px", textAlign: "center" }}>Chat Room</h3>
										{this.state.messages.length > 0 ? this.state.messages.map((item, index) => (
											<div key={index} style={{ textAlign: "left" }}>
												<p style={{ wordBreak: "break-all" }}><b>{item.sender}</b>: {item.data}</p>
											</div>
										)) : <div style={{ textAlign: "left" }}>No message yet</div>}
									</div>}

									{this.state.showPickEmoji && <Picker 
										style={{width: "300px"}}
										onSelect={(e) => {
											this.setState({
												message: this.state.message + e.native
											})
										}}
									/>}

									{this.state.typeRightBox === "chat" &&
									<div className="div-send-msg" style={{flex: "0 1 50px", marginBottom: "10px"}}>
										<Divider style={{ marginTop: "10px", marginBottom: "10px" }} />

										<IconButton style={{ color: "#424242" }} onClick={() => {
											this.setState({
												showPickEmoji: !this.state.showPickEmoji
											})
										}}>
											<InsertEmoticonIcon />
										</IconButton>
										<Input placeholder="Message" value={this.state.message} 
											onChange={e => this.handleMessage(e)} 
											onKeyUp={(event) => {
												if (event.key === 'Enter') this.sendMessage()
											}}/>
										<IconButton style={{ color: "#3f51b5" }} onClick={this.sendMessage}>
											<SendIcon />
										</IconButton>
									</div>}
								
								{this.state.typeRightBox === "people" && 
								<div style={{ flex: "1 1 auto", overflow: "auto", overflowY: "auto", textAlign: "left", marginLeft: "20px" }}>
									<h3 style={{ marginBottom: "10px" }}>People in the room</h3>
									{this.state.people.map((item, index) => (
										<div key={index} style={{ textAlign: "left" }}>
											<p>{item.username}</p>
										</div>
									))}
								</div>}

								{this.state.typeRightBox === "translate" && 
								<div style={{ flex: "1 1 auto", overflow: "auto", overflowY: "auto", textAlign: "left", marginLeft: "20px" }}>
									<h3 style={{ marginBottom: "10px" }}>{this.state.yourLanguage} transcript</h3>
									
									<InputLabel style={{margin: "10px", marginLeft: "0px"}}>The language you speak</InputLabel>
									<FormControl style={{marginBottom: "20px"}}>
										<Select
											value={this.state.yourLanguageKey}
											onChange={(e) => {
												socket.emit("change-language", e.target.value)

												this.setState({
													yourLanguageKey: e.target.value,
													yourLanguage: languages[e.target.value]
												}, () => {
													this.setLanguageForWatson()
												})
											}}>
											{languagesKeys.map((item, index) => (
												<MenuItem value={item} key={index}>{languages[item]}</MenuItem>
											))}
										</Select>
									</FormControl>

									{this.state.translations.length > 0 ? this.state.translations.map((item, index) => (
										<div key={index} style={{ textAlign: "left" }}>
											<p><b>{item.sender}</b>: {item.transcript}</p>
										</div>
									)) : <p>No transcript yet</p>}
								</div>}
							</div>}

						<div id="emojis"></div>
					</div>
				}
			</div>
		)
	}
}

export default Meet