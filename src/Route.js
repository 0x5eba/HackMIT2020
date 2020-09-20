import React, { Component } from 'react'
import Meet from './Meet'
import Home from './Home'
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';

class App extends Component {
	render() {
		return (
			<Router>
				<Switch>
					<Route path="/" exact component={Home} />
					<Route path="/:room" component={Meet} />
				</Switch>
			</Router>
		)
	}
}

export default App;