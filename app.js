const path = require('path')
var express = require('express');
var app = express();
var mysql = require('mysql');
app.set('view engine', 'pug')
app.set('views', path.join(__dirname, 'views'))
const fs = require('fs');
var http = require('http').Server(app);
var io = require('socket.io')(http);

var currentRightAnswer;
let rawdata = fs.readFileSync('questions.json');
let questions = JSON.parse(rawdata);
let DBInfo = JSON.parse(fs.readFileSync('DBConnect.json'));
var con = mysql.createConnection({
  host: DBInfo.host,
  database: DBInfo.database,
  user: DBInfo.username,
  password: DBInfo.password,
});
con.connect(function(err) {
    if (err) {
        console.error('Error connecting: ' + err.stack);
        return;
    }
    console.log('Connected as id ' + con.threadId);
});

//'Open' rooms w/out temp data causes issues
con.query("UPDATE Room SET State = 'closed'");
con.query("UPDATE Player SET inRoom = false")

var roomList = {};
var answerTime = 10;
app.use('/dist', express.static('dist'));
// app.use('/previousGames', function(req, res) {
//
// console.log(req,res)
// res.send(req.query.email)
// //$.get('http://sbhoot.fenetik.com/previousGames',{ name: "John", email: "2pm" },(data)=>{console.log(data)})
// });


app.get('*', function(req, res) {
  var url = req.url.split("/")[1]
  res.render('common', { clientType: url})
});

http.listen(8090, function() {
  console.log('listening on *:8090');
});

io.on('connection', function(socket) {

  socket.on('joinGame', (room, email, name, nickname, callback) => {
    joinGame(socket, room, email, name, nickname, callback)
  });

  socket.on('checkAnswer', (choice, time, email) => {
    checkAnswer(socket, choice, time, email);
  });

  socket.on('leaveGame', (email) => {
    leaveGame(socket, email);
  });

  socket.on('makeGame', (room, email, callback) => {
    makeGame(socket, room, email, callback);
  });

  socket.on('changeGameState', (room, state) => {
    changeGameState(socket, state);
  });

  socket.on('deleteGame', () => {
    deleteGame(socket);
  });

  socket.on('startGame', () => {
    startGame(socket);
  });

  socket.on('logUser', (email, firstName, lastName) => {
    //Add user to DB if they don't exist
    con.query(`INSERT INTO Person (Email, FirstName, LastName) SELECT '${email}', '${firstName}', '${lastName}' WHERE NOT EXISTS(SELECT * FROM Person WHERE Email='${email}')`);
  });
});

function sendQuestion(socket) {
  //Score remaining & refill noResponse
  scoreLeftovers(socket);
  //Save information thus far
  //Shuffle list if necessary
  if (!roomList[socket.room].questionShuffleList) {
    roomList[socket.room].questionShuffleList = shuffle(questions.length);
  }
  //Get next question
  var questionIndex = roomList[socket.room].questionShuffleList.pop();
  var question = questions[questionIndex];
  //Save last answer & set new answer
  var pastAnswer = roomList[socket.room]['answer'];
  roomList[socket.room]['answer'] = question.correct;
  delete question.correct;
  roomList[socket.room]['question'] = question;

  if(roomList[socket.room]['interval'] == 0){//First run
    io.to(socket.room).emit('sendQuestion', question);
  } else {
    sendAnswerAndPoints(socket, pastAnswer);
    setTimeout(()=>{io.to(socket.room).emit('sendQuestion', question);}, 2000);
  }
}

function shuffle(length) {
  var newArr = []
  var arr = Array.apply(null, {
    length: length
  }).map(Number.call, Number);
  while (arr.length) {
    var randomIndex = Math.floor(Math.random() * arr.length),
      element = arr.splice(randomIndex, 1)
    newArr.push(element[0]);
  }
  return newArr;
}

function responsesIn(x, socket){
  clearInterval(x);
  sendQuestion(socket);
  x = setInterval(function() {
    sendQuestion(socket);
  }, answerTime * 1000);
  return x;
}

function startGame(socket) {
  changeGameState(socket, 'playing');
  roomList[socket.room]['interval'] = 0;
  roomList[socket.room]['interval'] = responsesIn(roomList[socket.room]['interval'], socket);
  sendProfResults(socket);
}

function makeGame(socket, room, email, callback) {
  // con.query(`INSERT INTO Person (Email) SELECT '${email}' WHERE NOT EXISTS(SELECT * FROM Person WHERE Email='${email}')`);
  con.query(`SELECT * FROM Person WHERE Email = '${email}'`, (err, result) => {
    socket.masterId = result[0].PersonID;
    con.query(`SELECT * FROM Room WHERE InstructorID = ${socket.masterId} AND Name = '${room}'`, (err, result)=>{
      failed = result != undefined && result.length > 0;
      callback(failed);
      if(!failed){
        socket.join(room);
        socket.room = room;
        //Replace eventually
        roomList[room] = {
          players: [],
          //'questionHistory': [],
          noResponse: [],
          masterId: socket.id
        };
        con.query(`INSERT INTO Room (InstructorID, Name) VALUES (${socket.masterId}, '${room}');`);
      }
    });
  });
}

function joinGame(socket, room, email, name, nickname, callback) {
  con.query(`SELECT * FROM Room WHERE Name = '${room}' AND State = 'open'`, (err, result)=>{
    exists = result != undefined && result.length > 0;
    callback(!exists);
    if(exists){
      roomId = result[0].RoomID;
      con.query(`SELECT * FROM Person WHERE Email = '${email}'`, (err, result)=>{
        personId = result[0].PersonID;
        con.query(`INSERT INTO Player (PersonID, RoomID, NickName) SELECT '${personId}', '${roomId}', '${nickname}'
        WHERE NOT EXISTS(SELECT * FROM Player WHERE PersonID='${personId}' AND RoomID = '${roomId}')`);
      });

      socket.join(room);
      socket.room = room;

      roomList[room]['players'].push(
        {'name': name,
        'nickname': nickname,
        'score': 0,
        'socketId': socket.id,
        'email': email + roomList[room]['players'].length,
        'history': []});
      //Send nicknames to waiting rooms
      io.to(socket.room).emit('roomListUpdate', roomList[room]['players'].map(players=>players.nickname));
    }
  })
}

function checkAnswer(socket, choice, time, email) {
  var question = roomList[socket.room]['question'];
  //find player
  var player;
  var people = roomList[socket.room]['players'];
  for(var i in people){
    if(people[i]['socketId'] == socket.id){//Temporary
      player = people[i];
      break;
    }
  }
  //Store who answered & what
  var score = getPoints(socket, time, choice);
  player['score'] += score;
  player['history'].push(parseInt(choice));

  //Remove answered player
  roomList[socket.room]['noResponse'].splice(roomList[socket.room]['noResponse'].indexOf(email), 1);
  if (roomList[socket.room]['noResponse'].length == 0) {
    roomList[socket.room]['interval'] = responsesIn(roomList[socket.room]['interval'], socket);
  }
}

function leaveGame(socket, email) {
  //Make sure nobody is waiting for them to answer
  roomList[socket.room]['players'].splice(roomList[socket.room]['players'].indexOf(email), 1);
  roomList[socket.room]['noResponse'].splice(roomList[socket.room]['players'].indexOf(email), 1);

  //Set DB inRoom state to false
  con.query(`SELECT * FROM Person WHERE Email = '${email}'`, (err, result)=>{
    personId = result[0].PersonID;
    con.query(`UPDATE Player SET inRoom = false WHERE PersonID = '${personId}'`);
  });

  io.to(socket.room).emit('roomListUpdate', roomList[socket.room]['players'].map(players=>players.nickname));
  socket.leave(socket.room);
}

function changeGameState(socket, state) {
  con.query(`UPDATE Room SET State = '${state}' WHERE Name = '${socket.room}' AND InstructorID = ${socket.masterId}`);
}

function deleteGame(socket) {
  socket.to(socket.room).emit('roomClosed');

  con.query(`DELETE FROM Room WHERE Name = '${socket.room}' AND InstructorID = '${socket.masterId}'`);

  //Stop wasting server time
  if(roomList[socket.room]['interval']){
    clearInterval(roomList[socket.room]['interval']);
  }
  //Kick everyone from the room
  io.of('/').in(socket.room).clients((error, socketIds) => {
    if (error) throw error;
    socketIds.forEach(socketId => io.sockets.sockets[socketId].leave(socket.room));
  });
  delete roomList[socket.room];
}

// Returns the number of points to award a player
// if they answer the question correctly
function getPoints(socket, time, choice) {
  if(roomList[socket.room]['answer'] == choice){
    time -= 2;
    if(time < 0)
      time = 0;
    return Math.ceil(Math.pow((answerTime - time) / answerTime,1.7) * 100);
  }
  return 0;
}

// Adds -1 to the history of every unanswered player
// & resets the noResponse array
function scoreLeftovers(socket) {
  people = roomList[socket.room]['players'];

  for(var i in people){
    if(roomList[socket.room]['noResponse'].indexOf(people[i].email) > -1){
      people[i]['history'].push(-1);
    }
  }
  roomList[socket.room]['noResponse'] = roomList[socket.room]['players'].map(players=>players.email);
}

function sendAnswerAndPoints(socket, answer){
  for(player of roomList[socket.room]['players']){
    io.to(player['socketId']).emit('sendAnswer', answer, player['score']);
  }
  io.to(socket.room).emit('sendScoreBoard', roomList[socket.room]['players'].map(player => [player['nickname'], player['score']]));

  //Send results to instructor
  sendProfResults(socket);
}

function sendProfResults(socket){
  io.to(roomList[socket.room].masterId).emit('playerResults', roomList[socket.room]['players'].map(player => [player['name'], player['nickname'], player['score'], player['email'].replace(/[@\.]/g,"_")]));
}
