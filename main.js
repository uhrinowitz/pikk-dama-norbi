// SETTING UP THE SERVER
var express=require("express");
// var path = require('path');
// var favicon = require('serve-favicon');
// var logger = require('morgan');
// var cookieParser = require('cookie-parser');
// var bodyParser = require('body-parser');
// var session = require('express-session');
// var passport = require('passport');
// var LocalStrategy = require('passport-local').Strategy;
// var multer = require('multer');
// var flash = require('connect-flash');
// var mongo = require('mongodb');
// var mongoose = require('mongoose');
// var db = mongoose.connection;
// var expressValidator = require('express-validator');

// var routes = require('./index');
// var users = require('./users')

var app=express();

// view engine
//app.set('views', path.join(__dirname, 'views');
//app.set('view engine', 'jade');

// Handle File uploads
//app.use(multer({dest:'./uploads'}));

// // Handle sessions
// app.use(session({
// 	secret: 'secret',
// 	saveUninitialized: true,
// 	resave: true
// }));

// // Passport
// app.use(passport.initialize());
// app.use(passport.session());

// Validator
// app.use(expressValidator({
// 	errorformatter: function(param, msg, value){
// 		var namespace = param.split('.')
// 		, root = namespace.shift()
// 		, formParam = root;
// 		while(namespace.length){
// 			formParam += '[' + namespace.shift() + ']';
// 		}
// 		return {
// 			param: formParam,
// 			msg: msg,
// 			value: value
// 		};
// 	}
// }));

// app.use('/', routes);
// app.use('/users', users);

var server=require("http").Server(app);
var io = require('socket.io')(server);
let appPort = process.env.PORT || 4200;

// FILE SERVER SECTION
app.get('/', (req, res) => {  
    res.sendFile(__dirname + '/html/index.html');
});
app.get('/game', (req, res) =>{  
    res.sendFile(__dirname + '/nevek.html');
});
app.get('/style.css', (req, res) => {
	res.sendFile(__dirname + "/" + "style.css");
  });
// serve all card images
var htmlPath = __dirname + '/' + 'html';
app.use(express.static(htmlPath));

// VARIABLES SECTION
// server specific variables
let clients = [];
let players = [];
let deck = [];
let connectionsLimit = 4;
// game specific variables
let playerOrder = [];
let originalPlayerOrder = [];
let evalCards = [];
// let korElejenAtadottKartyak = 0;
let cycle = 1;
let round = 1;
let atadasiKor = true;
let canCallQofSpades = false;
let canCallHeart = false
let gameInit = true;
let merre;
let winner;
let szin = null;
let allitottam = false;
let lehetosegek = [];
let connectionNumber;
let confirmAtadasCounter = 0;
let atadasConfirmedByAll = false;

// START OF SERVER-CLINt
io.sockets.on('connection', (socket) => {
	//console.log("Server started");
		if (io.engine.clientsCount > connectionsLimit) {
		socket.emit('err', { message: 'reach the limit of connections' })
		socket.disconnect()
		//console.log('Disconnected...')
		return
	  }
	  socket.emit('welcome', "welcome to the server!");

// listens for client ids with join and pushes them to array
// displays all ids in the black console
socket.on('join', (clientID) => {
		clients.push(clientID);
		let counter = clients.length;
		socket.emit('onePlayerJoined', counter);
		for(i=0; i<clients.length; i++){
			//console.log("Player" + [i] + " is: " + clients[i]);
		}
	})

// notify client side browser console when all players have joined
socket.on('allPlayersJoined', () =>{
	socket.emit('allPlayersJoined', '');
})

socket.on('chatMessage', (text)=>{
	message = text;
	io.of('/').emit('messageReceived', message);
})

socket.on('letTheGameBegin', () => {
	// create players
	createPlayers();
	// shuffle cards in deck array
	shuffle(deck);
	// split deck to 4 slices
	splitDeck();
	for(i=0; i<players.length; i++){
		players[i].playerID = clients[i];
	}
	let notFirstGame = false;
	data = {
		players: players,
		clients:clients,
		notFirstGame: notFirstGame
	}
	for(i=0; i<clients.length; i++){
		io.to(players[i].playerID).emit('setupDone', data);
	}
})

// create player order for the first round
function jatekosSorrend(){
	getPlayOrder(winner);
	playerOrder.length = 4;
	console.log("Player order is : " + playerOrder + " round is: " + round);
	
	for(i=0; i<playerOrder.length; i++){
		originalPlayerOrder.push(playerOrder[i]);
	}
	originalPlayerOrder.length = 4;
}

socket.on('sendingMyName', (data)=>{
	connectionNumber = io.engine.clientsCount;
	if(connectionNumber == 4){
		//console.log(data.name)
		for(i=0;i<4;i++){
			if(players[i].playerID == data.myID){
				players[i].playerName = data.name;
			}
		}
	socket.broadcast.emit('nevErkezett', players);
	}
})

socket.on('confirmAtadas', (myID)=>{
	if(!atadasConfirmedByAll && cycle % 4 != 0){
		// set atadas for players if they have 3 cards to pass
		let playerNumber = getPlayerNumberByID(myID);
		console.log("playerno: " + playerNumber)
		if(players[playerNumber].tempCardsToPass.length == 3){
			setAtadas(myID);
		}
		// check if confirm atadas == 4
		confirmAtadasCounterFunction();

		console.log(confirmAtadasCounter)
		// inform clients
		if(confirmAtadasCounter == 4){
			atadasConfirmedByAll = true;
			console.log('atadas Teljese nKesz');
		}
		if(atadasConfirmedByAll){
				// átcserélem az átadandó kártyákat
				swapAtadandoKartyak();

				// sortoljuk a kártyákat
				for(i=0;i<4;i++){
					let temparray = [];
					temparray = [...players[i].playerCards]
					players[i].playerCards = [];
					players[i].playerCards = [...sortByColor(temparray)];
				}
	
				// kártáykat ujbol kikuldjuk a kliensnek
				data = {
					players: players,
					cycle: cycle
				}
				for(i=0; i<4; i++){
					//console.log("atadas kesz")
					io.to(players[i].playerID).emit('atadasDone', data);
				}
			}
	}
})

// ==================================================================================
// game loop
socket.on('playerPickedCard', (data) => {
	// check first if current player has the card
	let van = players[data.localPlayerNumber].playerCards.filter(card => card.color==data.pickedCard[0] && card.number==data.pickedCard[1]);
	if(van.length > 0){
		van = [];
	} else {
		// visszaíratom vele a kártyákat
	}

	// //check if current player has the card to call
	if(atadasiKor && cycle % 4 != 0){	
		// tegyük középre a kártyát
		let atadSzin = data.pickedCard[0];
		let atadSzam = data.pickedCard[1];
		let playerRemovedACard = false;
		text = atadSzin + "-" + atadSzam // 0-0 for treff 2

		// kiveszem a pickelt kártyát, ha már benne volt az átadandók között
		let tempCardsToPass = [...players[data.localPlayerNumber].tempCardsToPass];
		let marPickelte = tempCardsToPass.filter(card => card.color==atadSzin && card.number==atadSzam).length > 0;
		if(marPickelte){
			let index = tempCardsToPass.findIndex(card => card.color == atadSzin && card.number == atadSzam);
			players[data.localPlayerNumber].tempCardsToPass.splice(index, 1);
			playerRemovedACard = true;
			tempCardsToPass = [];
		}

		// hozzáadom a pickelt kártyát, ha még nincsen benne
		if(!playerRemovedACard){
			if(players[data.localPlayerNumber].tempCardsToPass.length < 3){
				players[data.localPlayerNumber].tempCardsToPass.push({
					color: parseInt(data.pickedCard[0]),
					number: parseInt(data.pickedCard[1])
				})
			let strAtad = JSON.stringify(players[data.localPlayerNumber].tempCardsToPass);
			//console.log("Átadom: " + strAtad)
			}
		}
		// kiíratjuk a kártyákat középen
		let aktualisanAtadottKartyak = [...players[data.localPlayerNumber].tempCardsToPass];
		io.to(data.myID).emit('atadKartyaKozepre', aktualisanAtadottKartyak);

	} else{
		// define players and check if current player has the card to call
		if(gameInit){
			jatekosSorrend();
			gameInit = false;
		}
		let okPlayer = checkCard(data.pickedCard[0], data.pickedCard[1]); // pl. 0,0 for treff 2
		let currentPlayer = playerOrder[0];
		if (canCallHeart == false && data.pickedCard[0] == 2 && playerOrder.length == 4){
			//console.log("Kőrt még nem szabad hívni!")
		}
		else if(round == 1 && data.pickedCard[0] == 2){
			//console.log("Kőrt még nem szabad tenni!")
		}
		else if (canCallQofSpades == false && data.pickedCard[0] == 3 && data.pickedCard[1] == 10){
			//console.log("Pikk Q-t még nem szabad hívni!")	
		}
		else if(okPlayer == currentPlayer){
			if(!canCallHeart && data.pickedCard[0]==2){
				canCallHeart = true;
			}
			// addoljuk a hívható kártyákat
			let szin = data.pickedCard[0];
			addCardOptions(szin);

			// megvan-e a player[currentplayer].lehetosegek-ben a data.pickedCard?
			let szin1=data.pickedCard[0];
			let szam1=data.pickedCard[1];
			let currentID = data.myID;
			playerHasCard(szin1, szam1, currentPlayer, currentID);
		} else {
			text = "Nem a te köröd van!";
			io.to(data.myID).emit('notYourTurn', text);
		}
	}
	if(evalCards.length == 4){
		// evaluate round
		winner = evalRound(evalCards);
		// reset array
		evalCards.length = 0;
		io.of('/').emit('roundWinner', winner);
	}
	if(winner > -1){
		if (playerOrder.length == 0) {
			// increment round
			incrementRound();
			getPlayOrder(winner);
			// keep record with original one to determine winner
			originalPlayerOrder.length = 0;
			for(i=0; i<playerOrder.length; i++){
				originalPlayerOrder.push(playerOrder[i]);
		   }
		   originalPlayerOrder.length = 4;
		   }
		winner = 0;
		checkEndOfCycle();
	}
	if(deck.length == 0){
		// game over
		checkEndOfCycle();

	}
})						

socket.on("showPoints", (playerSocketID)=>{
	connectionNumber = io.engine.clientsCount;
	if(connectionNumber == 4){
		let pontok = [];
		for(i=0; i<4; i++){
			let pontokTomb = [];
			console.log("final points:" + players[i].finalPoints)
			pontokTomb = [...players[i].finalPoints]
			// pontokTomb = [1,2,3,4];
			let points = 0;
			for(j=0; j<players[i].playerInventory.length; j++){
				if(players[i].playerInventory[j].color == 2){ // ha kőr
					points+=1;
				}
				else if(players[i].playerInventory[j].color == 3){ // ha pick dáma
					if(players[i].playerInventory[j].number==10){
						points+=13;
					}
				}
			}
			pontokTomb.push(points);
			pontok.push(pontokTomb);
		}
		console.log("A pontok hossza: "+pontok.length);
		io.to(playerSocketID).emit('getPoints', pontok);		
	}
})

function checkEndOfCycle(){
	// game over when round == 14
	if(round == 3){
		console.log("round is: " + round + ", sending gamover")
		cycle+=1;
		io.of('/').emit('gameOver', '');
	}

}

socket.on('newGame', (myID)=>{
//if(!pointsCounted){
	// reset all global variables
	deck = [];
	playerOrder = [];
	cardsToReceiveByPlayer = [];
	originalPlayerOrder = [];
	//korElejenAtadottKartyak = 0;
	round = 1;
	console.log("new game round: " + round)
	atadasiKor = true;
	canCallQofSpades = false;
	canCallHeart = false
	atadasConfirmedByAll = false;
	gameInit = true;
	merre;
	winner = undefined;
	szin = null;
	allitottam = false;
	lehetosegek = [];

	// felírom, hány pontja van egy array-be
	//for(i=0; i<4; i++){
		let finalPoints = 0;
		let playerNumber = getPlayerNumberByID(myID);
		console.log("player number: " + playerNumber)
		console.log("final points adding: " + finalPoints)
		console.log("ennyi kártyája van: " + players[playerNumber].playerInventory.length)

		console.log("for előtt")
				for(j=0; j<players[playerNumber].playerInventory.length; j++){
			console.log("forban vagyunk benne")
			if(players[playerNumber].playerInventory[j].color == 2){ // ha kőr
				finalPoints+=1;
				console.log("kört addolunk")
			}
			else if(players[playerNumber].playerInventory[j].color == 3){
				 // ha pick dáma
				 if(players[playerNumber].playerInventory[j].number==10){
					finalPoints+=13;
					console.log("pikket addolunk")
				}
			}
		}

		players[playerNumber].playerCards = [];
		players[playerNumber].playerInventory = [];
		players[playerNumber].lehetosegek = [];
		players[playerNumber].cardsToPass = [];
		players[playerNumber].tempCardsToPass = [];
		players[playerNumber].atadasDone = false;
		console.log("final points adding: " + finalPoints)
		players[playerNumber].finalPoints.push(finalPoints);		
	//}

	//for(i=0;i<4;i++){
		// players[i].playerCards = [];
		// players[i].playerInventory = [];
		// players[i].lehetosegek = [];
		// players[i].cardsToPass = [];
		// players[i].tempCardsToPass = [];
		// players[i].atadasDone = false;
	//}
	evalCards = [];
	createCards();
	shuffle(deck);
	splitDeck();
	let notFirstGame = true;
	data = {
		players: players,
		clients:clients,
		notFirstGame: notFirstGame
	}
	console.log("new game variables set up!")
	for(i=0; i<4; i++){
		//console.log("new game-nél az i: " + i)
		io.to(players[i].playerID).emit('setupDone', data);
	}
//}
})

function playerHasCard(szin, szam, currentPlayer, currentID){
	text = szin + "-" + szam // 0-0 for treff 2";
	//console.log("picked cards for " + currentPlayer + " :" + text)
	for(i=0;i<players[currentPlayer].lehetosegek.length; i++){
		if(players[currentPlayer].lehetosegek[i].color == szin){
			if(players[currentPlayer].lehetosegek[i].number == szam){
				io.of('/').emit('onCorrectPlayerPick', text);
				// remove player
				playerOrder.shift();
				// add card for eval
				evalCards.push({
					color: parseInt(szin),
					number: parseInt(szam)
					});
				// remove card
				removeCard(szin, szam);
				// remove card from DOM
				io.to(currentID).emit('removeCardfromDom', '');
				////console.log("Deck len is: " + deck.length);				
			} else { 
				//console.log("Ezt a kártyát nem tudja pickelni!")
			}
		}
	}

}

function addCardOptions(szin){
	if(round == 1 && allitottam==false){
		// első körben csak treffet szabad
		szin = 0;
		generateCardOptions(szin);
	} else {
		// nem az első kör
		if(playerOrder.length == 4 && allitottam == false){
			generateCardOptions2(szin);
		}
	}
}
function generateCardOptions2(szin){
	for(i=0; i<4; i++){
		for(j=0;j<players[i].playerCards.length; j++){
			if(players[i].playerCards[j].color==szin){
			// van ilyen szine
				lehetosegek.push({
					color: players[i].playerCards[j].color,
					number: players[i].playerCards[j].number
				})
			}
		}
		if(lehetosegek.length == 0){
		// nincs ilyen szine
			lehetosegek = [...players[i].playerCards];						
		}
		// hozzáadom az adott playerhez a lehetőségeket
		players[i].lehetosegek = [... lehetosegek];
		//console.log("A lehetőségek: " )
		strLehet = JSON.stringify(lehetosegek);
		console.log("lehetőségek: " + strLehet)
		// majd üritem a tömböt a következő iterációhoz
		lehetosegek = [];
	}
	// hogy csak egy körben egyszer legyen ez a check
	allitottam = true;

}

function generateCardOptions(szin){
	for(i=0; i<4; i++){
		for(j=0;j<players[i].playerCards.length; j++){
			if(players[i].playerCards[j].color==szin){
			// van ilyen szine
				lehetosegek.push({
					color: players[i].playerCards[j].color,
					number: players[i].playerCards[j].number
				})
			}
			if(lehetosegek.length == 0){
			// nincs ilyen szine
				lehetosegek = [...players[i].playerCards];
			}
		}
		// hozzáadom az adott playerhez a lehetőségeket
		// player 1 csak treff 2-t hívhat
		if(i==playerOrder[0]){
			players[i].lehetosegek.push({
				color: 0,
				number: 0
			})
			//console.log("A lehetőségek player" + i )
			strLehet = JSON.stringify(lehetosegek);
			//console.log("lehetőségek: " + strLehet)
		} else {
			players[i].lehetosegek = [... lehetosegek];
			//console.log("A lehetőségek player" + i )
			strLehet = JSON.stringify(lehetosegek);
			//console.log("lehetőségek: " + strLehet)
		}

		
		// majd üritem a tömböt a következő iterációhoz
		lehetosegek = [];
	}
	// hogy csak egy körben egyszer legyen ez a check
	allitottam = true;
}

function incrementRound(){
	console.log("round is incremented from: " + round)
	allitottam = false;
	canCallQofSpades = true;
	return round += 1;

}

function evalRound(evalCards){
	j = 0;
	for(i=1; i<4; i++){
		if(evalCards[j].color == evalCards[i].color){
			if(evalCards[j].number < evalCards[i].number)
				j = i;
		}
	}
	winner = originalPlayerOrder[j];
	text = "Winner is: Player" + parseInt(winner+1);
	// add won cards to player's inventory
	players[winner].playerInventory = [...players[winner].playerInventory, ...evalCards];
	for(i=0;i<4;i++){
	console.log("Winner's inventory: "  + players[i].playerInventory.length);
	}
	return winner;
}

function getPlayOrder(winner){
	if(playerOrder.length < 5){
		// define player order
		let firstPlayer;
		console.log("megnézzük egy-e a round: " + round)
		if(round == 1){
			if(playerOrder.length < 5){
				firstPlayer = getPlayerOrder(0,0);
				// console.log(firstPlayer);
			}
		} else {
			firstPlayer = winner;
		}
		playerOrder.push(firstPlayer);
		// add rest of players
		addRestPlayers(firstPlayer);
		text = round + ". kör kezdődik! Player" + (firstPlayer + 1) + " hív!";
		io.of('/').emit('newRound', text);
		} else {
			//console.log("playerorder already more than 4");
		}
	}

})

function removeCard(color, number){
	// loop players and their cards
	var len = players.length;
	for(j=0;j<len;j++){
		for(i=0;i<players[j].playerCards.length;i++){
			// remove card from players card list
			if(players[j].playerCards[i].color == color){
				if(players[j].playerCards[i].number == number){
					players[j].playerCards.splice(i, 1);
					// also remove from deck
					deck.splice(i, 1);
				}
			}
		}
	}
}

function addRestPlayers(firstPlayer) {
	// case 3
	if(firstPlayer == 3){
		for(i=0; i<3; i++){
			playerOrder.push(i);
		}
		return playerOrder;	
	}

	// case 0
	else if(firstPlayer == 0) {
		for(i=firstPlayer + 1; i<players.length; i++){
			playerOrder.push(i);
		}
		return playerOrder;
	}
	// case 1, 2
	else {
		console.log("first player: " + firstPlayer)
		switch (firstPlayer) {
			case 1:
				return playerOrder = [1, 2, 3, 0];
			case 2:
				return playerOrder = [2, 3, 0, 1];
			default:
				console.log("fail in addRestPlayers");
		}
	}
}

function getPlayerOrder(color, number){
	console.log("playerorder from getplayerorder is run")
	var len = players.length;
	for(j=0;j<len;j++){
		for(i=0;i<players[j].playerCards.length;i++){
			if(players[j].playerCards[i].color == color){
				if(players[j].playerCards[i].number == number){
					return players[j].playerNum;
				}
			}

		}
	}
	
}

class Card {
	constructor(color, number) {
		this.color = color;
		this.number = number;
	}	
}

// create player class
class Player {
	constructor(playerNum) {
		this.playerID;
		this.playerNum = playerNum;
		this.playerCards = [];
		this.playerInventory = [];
		this.playerName;
		this.cardsToPass = [];
		this.tempCardsToPass = [];
		this.lehetosegek = [];
		this.finalPoints = [];
		this.atadasDone = false;
	}
}

//create cards
createCards();
console.log("Deck created with: " + deck.length);

function createCards(){
	for(i=0; i<4; i++){
		// create colors
		for(j=0; j<13; j++){
			// create 13 numbers
			deck.push(new Card(i,j));
		}
	}
	return deck;
}

function createPlayers(){
	for(i=0; i<4;i++){
		players.push(new Player(i));
	}
}

function shuffle(deck) {
	var currentIndex = deck.length, temporaryValue, randomIndex;
  
	// While there remain elements to shuffle...
	while (0 !== currentIndex) {
  
	  // Pick a remaining element...
	  randomIndex = Math.floor(Math.random() * currentIndex);
	  currentIndex -= 1;
  
	  // And swap it with the current element.
	  temporaryValue = deck[currentIndex];
	  deck[currentIndex] = deck[randomIndex];
	  deck[randomIndex] = temporaryValue;
	}
  
	return deck;
  }

function splitDeck(){
	var i,j,temparray,chunk = 13, k=0;
	for (i=0,j=deck.length; i<j; i+=chunk) {
		// holds 13 cards
		temparray = deck.slice(i,i+chunk);
		temparray = sortByColor(temparray);
		// add these 13 cards to players
		players[k].playerCards = temparray;
		k++;
	}
}

function sortByColor(temparray) {
	// színek rendezése
	let len = temparray.length-1;
	let count = 0;
    for (let i = 0; i < len; i++) {
    	for (let j = 0; j < len; j++) {
            if (temparray[j].color > temparray[j + 1].color) {
                let tmp = temparray[j];
                temparray[j] = temparray[j + 1];
                temparray[j + 1] = tmp;
            }
        }
	}
	// számok rendezése
	k=1;   
 	for (let i = 0; i < len+1; i++) {
        for (let j = 0; j < len; j++) {
            if(temparray[j].color==temparray[k].color){
                if (temparray[j].number > temparray[k].number) {
                    let tmp = temparray[j];
                    temparray[j] = temparray[k];
                    temparray[k] = tmp;
            	}
            }
            k+=1;
		}
		k=1
	}
    return temparray;
};
  
function checkCard(color, number){
	// loop players and their cards
	var len = players.length;
	for(j=0;j<len;j++){
		for(i=0;i<players[j].playerCards.length;i++){
			// check if correct player has the card
			if(players[j].playerCards[i].color == color){
				if(players[j].playerCards[i].number == number){
					return players[j].playerNum;
				}
			}

		}

	}
}

function setAtadas(myID){
	for(i=0; i<4; i++){
		if(players[i].playerID == myID){
			players[i].atadasDone = true;
		}
	}

}

function confirmAtadasCounterFunction(){
	confirmAtadasCounter = 0;
	for(i=0; i<4; i++){
		if(players[i].atadasDone){
			confirmAtadasCounter++;
		}
	}
}

function swapAtadandoKartyak(){
	for(i=0; i<4; i++){
		players[i].cardsToPass = [...players[i].tempCardsToPass];
	}
	// Jobbra kör
	if(cycle % 4 == 1){
		console.log("Éppen cycle 1 van, jobbra adunk");
		// először elveszem az átadandó kártyákat mindegyik playertől
		for(h=0; h<4;h++){
			for(i=0; i<players[h].cardsToPass.length; i++){
				for(j=0; j<players[h].playerCards.length; j++)
					if(players[h].cardsToPass[i].color == players[h].playerCards[j].color){
						if(players[h].cardsToPass[i].number == players[h].playerCards[j].number){
							players[h].playerCards.splice(j, 1);
						}
					}
				}
				
		}
		//console.log("Elvettük a kártyákat, length: " + players[0].playerCards.length);
		// majd hozzáadom a kapott kártyákat
		players[0].playerCards = [...players[0].playerCards, ...players[1].cardsToPass];
		players[1].playerCards = [...players[1].playerCards, ...players[2].cardsToPass];
		players[2].playerCards = [...players[2].playerCards, ...players[3].cardsToPass];
		players[3].playerCards = [...players[3].playerCards, ...players[0].cardsToPass];
		for(i=0;i<4;i++){
			//console.log(i + "-nek van ennyi kártyája: " + players[i].playerCards.length)
		}
	}
	// Balra adunk
	else if(cycle % 4 == 2){
		console.log("Éppen cycle 2 van, balra adunk");
		console.log("amúgy a round az: " + round)
		// először elveszem az átadandó kártyákat mindegyik payertől
		for(h=0; h<4;h++){
			for(i=0; i<players[h].cardsToPass.length; i++){
			for(j=0;j<players[h].playerCards.length;j++)
				if(players[h].cardsToPass[i].color == players[h].playerCards[j].color){
					if(players[h].cardsToPass[i].number == players[h].playerCards[j].number){
						players[h].playerCards.splice(j, 1);
					}
				}
			}
		}
		//console.log("Elvettük a kártyákat, length: " + players[0].playerCards.length);
		// majd hozzáadom a kapott kártyákat
		players[0].playerCards = [...players[0].playerCards, ...players[3].cardsToPass];
		players[1].playerCards = [...players[1].playerCards, ...players[0].cardsToPass];
		players[2].playerCards = [...players[2].playerCards, ...players[1].cardsToPass];
		players[3].playerCards = [...players[3].playerCards, ...players[2].cardsToPass];
		for(i=0;i<4;i++){
			//console.log(i + "-nek van ennyi kártyája: " + players[i].playerCards.length)
		}
	}

	//Szembe adunk
	else if(cycle % 4 == 3){
		console.log("Éppen cycle 3 van, keresztbe adunk");
		// először elveszem az átadandó kártyákat mindegyik payertől
		for(h=0; h<4;h++){
			for(i=0; i<players[h].cardsToPass.length; i++){
			for(j=0;j<players[h].playerCards.length;j++)
				if(players[h].cardsToPass[i].color == players[h].playerCards[j].color){
					if(players[h].cardsToPass[i].number == players[h].playerCards[j].number){
						players[h].playerCards.splice(j, 1);
					}
				}
			}
		}
		//console.log("Elvettük a kártyákat, length: " + players[0].playerCards.length);
		// majd hozzáadom a kapott kártyákat
		players[0].playerCards = [...players[0].playerCards, ...players[2].cardsToPass];
		players[1].playerCards = [...players[1].playerCards, ...players[3].cardsToPass];
		players[2].playerCards = [...players[2].playerCards, ...players[0].cardsToPass];
		players[3].playerCards = [...players[3].playerCards, ...players[1].cardsToPass];
		for(i=0;i<4;i++){
			//console.log(i + "-nek van ennyi kártyája: " + players[i].playerCards.length)
		}
	}
	atadasiKor = false;
}

function getPlayerNumberByID(myID){
	for(i=0; i<4; i++){
		if(players[i].playerID == myID){
			return players[i].playerNum;
		}
	}
}

server.listen(appPort);
