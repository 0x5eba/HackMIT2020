import React, { Component } from 'react';
import { Input, Button, TextField } from '@material-ui/core';
import io from 'socket.io-client'
import { message } from 'antd'
import 'antd/dist/antd.css'
import "./style.css"

const serverUrl = process.env.NODE_ENV === 'production' ? 'https://hackmit.sebastienbiollo.com' : "http://localhost:9001"
var socket

class Home extends Component {
  	constructor (props) {
		super(props)
		this.state = {
			search: '',
			url: '',
			communities: [],
			title: '',
		}
		this.connectToSocketServer()
	}

	connectToSocketServer = () => {
		socket = io.connect(serverUrl)

		socket.on('connect', () => {
			socket.emit('join-home')
			socket.emit('get-communities')

			socket.on('get-communities-reply', (communities) => {
				communities = JSON.parse(communities)

				let l = []
				for (let path of Object.keys(communities)) {
					l.push(communities[path])
				}
				l.sort((a, b) => (a.partecipants < b.partecipants) ? 1 : -1)

				this.setState({
					communities: l
				})
			})
		})
	}

	handleChange = (e) => this.setState({ url: e.target.value })
	handleChangeSearch = (e) => this.setState({ search: e.target.value })
	handleChangeTitle = (e) => this.setState({ title: e.target.value })

	joinMeeting = () => {
		if (this.state.url !== "") {
			var room = this.state.url.split("/")
			window.location.href = `/${room[room.length-1]}`
		} else {
			window.location.href = `/${Math.random().toString(36).substring(2, 12)}`
		}
	}

	createMeeting = () => {
		if(this.state.title.length === 0) {
			message.error("Insert a title")
			return
		}

		let ok = true
		for (let path of Object.keys(this.state.communities)) {
			if(this.state.communities[path].title === this.state.title) {
				ok = false
			}
		}

		if(ok === true) {
			let url = window.location.href + `${Math.random().toString(36).substring(2, 12)}`
			socket.emit('create-community', url, this.state.title)

			this.setState({
				title: ""
			})

			message.success("Click the meeting to join it")
		} else {
			message.error("A meeting with this title already exist")
		}
	}

	render() {
		return (
			<div style={{backgroundImage: "url('world.jpg')",
				backgroundRepeat: "no-repeat", backgroundSize: "100% 100%", height: "100vh", paddingTop: "100px"}}>
				<div style={{
					display: "flex", flexFlow: "column", height: "60%", maxWidth: "800px", background: "white",
					padding: "20px", minWidth: "400px", borderRadius: "10px",
					textAlign: "center", margin: "auto", justifyContent: "center"
				}}>
					<div style={{flex: "0 1 auto"}}>
						<div style={{ fontSize: "45px", fontWeight: "900", paddingBottom: "30px", color: "#03a9f4" }}>HackMITting</div>

						<TextField label="Search community" type="search" variant="outlined" style={{width: "55%"}}
							value={this.state.search} onChange={e => this.handleChangeSearch(e)} />

						<div>
							<Input placeholder="Title community" value={this.state.title} onChange={e => this.handleChangeTitle(e)} />
							<Button variant="contained" color="primary" onClick={this.createMeeting} 
								style={{ margin: "20px" }}>Create a community meeting</Button>
						</div>
					</div>

					<div style={{ flex: "1 1 auto", overflow: "auto", 
							overflowY: "auto", justifyContent: "center", textAlign: "center" }}>
						{this.state.communities.filter(item => {
							if (this.state.search.length > 0) {
								let re = new RegExp(this.state.search.toLowerCase(), "i")
								return re.test(item.title.toLowerCase())
							}
							return true
						}).map((item, index) => (
							<div key={index}
								style={{
									width: "300px", height: "50px", margin: "15px", marginBottom: "0px", padding: "15px", paddingTop: "10px",
									textTransform: 'none', backgroundColor: "white", textAlign: "left",
									justifyContent: "left", fontSize: "17px", borderRadius: "7px", display: "inline-block",
									boxShadow: "0px 3px 1px -2px rgba(0,0,0,0.2), 0px 2px 2px 0px rgba(0,0,0,0.14), 0px 1px 5px 0px rgba(0,0,0,0.12)"
								}}
								onClick={() => window.location.href = `${item.path}`}
								>
									<div style={{ textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden", cursor: "pointer" }}>
										<p style={{display: "inline-block", color: "#4caf50"}}>{item.partecipants} online</p> | {item.title}
									</div>
							</div>
						))}
					</div>
				</div>
			</div>
		)
	}
}

export default Home;