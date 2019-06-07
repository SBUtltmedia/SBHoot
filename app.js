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

  socket.on('requestPreviousGames', (email) =>{
    requestPreviousGames(socket, email);
  });
});

// TODO:
// Sanitize DB inputs
// Allow re-joining of games
// Display game report to instructor


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
  roomList[socket.room]['noResponse'] = [];
  roomList[socket.room]['interval'] = 0;
  roomList[socket.room]['interval'] = responsesIn(roomList[socket.room]['interval'], socket);
  sendProfResults(socket);
}

function makeGame(socket, room, email, callback) {
  con.query(`SELECT * FROM Person WHERE Email = '${email}'`, (err, result) => {
    socket.masterId = result[0].PersonID;
    con.query(`SELECT * FROM Room WHERE InstructorID = ${socket.masterId} AND Name = '${room}'`, (err, result)=>{
      failed = result != undefined && result.length > 0;
      callback(failed);
      if(!failed){
        socket.join(room);
        socket.room = room;
        roomList[room] = {
          players: {},
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
      socket.join(room);
      socket.room = room;

      roomList[room].players[email] = {
        name: name,
        nickname: nickname,
        score: 0,
        socketId: socket.id,
        history: []};
      //Send nicknames to waiting rooms
      io.to(socket.room).emit('roomListUpdate', getMapAttr(roomList[room].players, ['nickname']));

      roomId = result[0].RoomID;
      roomList[room].roomId = roomId;
      con.query(`SELECT * FROM Person WHERE Email = '${email}'`, (err, result)=>{
        personId = result[0].PersonID;
        roomList[room].players[email].personId = personId;
        con.query(`INSERT INTO Player (PersonID, RoomID, NickName)
        SELECT '${personId}', '${roomId}', '${nickname}'
        WHERE NOT EXISTS(SELECT * FROM Player WHERE PersonID='${personId}' AND RoomID = '${roomId}')`);
      });
    }
  });
}

function checkAnswer(socket, choice, time, email) {
  //var question = roomList[socket.room]['question'];
  var player = roomList[socket.room]['players'][email];
  //Store who answered & what
  var score = getPoints(socket, time, choice);
  player['score'] += score;
  player['history'].push(parseInt(choice));

  //Update DB
  var room = socket.room;
  if(score > 0){
    con.query(`UPDATE Player
      SET NumberAnswered = NumberAnswered + 1 AND NumberCorrect = NumberCorrect + 1 AND Score = Score + ${score}
      WHERE PersonID = ${roomList[room].players[email].personId} AND RoomID = ${roomList[room].roomId}`);
  } else {
    con.query(`UPDATE Player
      SET NumberAnswered = NumberAnswered + 1
      WHERE PersonID = ${roomList[room].players[email].personId} AND RoomID = ${roomList[room].roomId}`);
  }

  //Remove answered player
  roomList[socket.room]['noResponse'].splice(roomList[socket.room]['noResponse'].indexOf(email), 1);
  if (roomList[socket.room]['noResponse'].length == 0) {
    roomList[socket.room]['interval'] = responsesIn(roomList[socket.room]['interval'], socket);
  }
}

function leaveGame(socket, email) {
  //Make sure nobody is waiting for them to answer
  roomList[socket.room]['noResponse'].splice(roomList[socket.room]['players'].indexOf(email), 1);
  delete roomList[socket.room]['players'][email];

  //Set DB inRoom state to false
  con.query(`SELECT * FROM Person WHERE Email = '${email}'`, (err, result)=>{
    personId = result[0].PersonID;
    con.query(`UPDATE Player SET inRoom = false WHERE PersonID = '${personId}'`);
  });

  io.to(socket.room).emit('roomListUpdate', getMapAttr(roomList[socket.room]['players'], ['nickname']));
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

// Adds -1 to the history of every unanswered player
// & resets the noResponse array
function scoreLeftovers(socket) {
  for(var person of roomList[socket.room]['noResponse']){
    con.query(`UPDATE Player
      SET NumberAnswered = NumberAnswered + 1
      WHERE PersonID = ${roomList[socket.room].players[person].personId} AND RoomID = ${roomList[socket.room].roomId}`);
  }
  roomList[socket.room]['noResponse'] = getMapAttr(roomList[socket.room]['players'], ['email']);
}

function sendAnswerAndPoints(socket, answer){
  for(var key in roomList[socket.room]['players']){
    var player = roomList[socket.room].players[key];
    io.to(player.socketId).emit('sendAnswer', answer, player.score);
  }
  io.to(socket.room).emit('sendScoreBoard', getMapAttr(roomList[socket.room]['players'], ['nickname', 'score']));

  //Send results to instructor
  sendProfResults(socket);
}

function sendProfResults(socket){
  io.to(roomList[socket.room].masterId).emit('playerResults', getMapAttr(roomList[socket.room]['players'], ['name', 'nickname', 'score', 'email']));
}

function requestPreviousGames(socket, email){
  if(email == null)
    return;
  con.query(`SELECT * FROM Person WHERE Email = '${email}'`, (err, result)=>{
      if(result.length == 0)
        return;
      con.query(`SELECT *
        FROM Room
        WHERE InstructorID = ${result[0].PersonID}`, (err, result) =>{
          io.to(socket.id).emit('returnPreviousGames', result);
        });
    });
}


//UTILITY FUNCTIONS

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

// Returns the number of points to award a player
// if they answer the question correctly
function getPoints(socket, time, choice) {
  if(roomList[socket.room]['answer'] == choice){
    time -= 1;
    if(time < 0)
      time = 0;
    return Math.ceil(Math.pow((answerTime - time) / answerTime,1.7) * 100);
  }
  return 0;
}

//Returns a scalar or array of specified values from a dictionary
function getMapAttr(dict, attrs){
  if(attrs.length == 1)
    if(attrs[0] == 'email')
      return Object.keys(dict).map((key)=> {return key});
    else
      return Object.keys(dict).map((key)=> {return dict[key][attrs[0]]});
  else{
    return Object.keys(dict).map((key)=> {
      items = [];
      for (attribute of attrs){
        if(attribute == 'email')
          items.push(key);
        else
          items.push(dict[key][attribute]);
      }
      return items;
    });
  }
}
