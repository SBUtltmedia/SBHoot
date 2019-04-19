var express = require('express');
var app = express();
const fs = require('fs');
var http = require('http').Server(app);
var io = require('socket.io')(http);

var currentRightAnswer;
let rawdata = fs.readFileSync('questions.json');
let questions = JSON.parse(rawdata);
var questionShuffleList = shuffle(questions.length);
var roomList = {};
var answerTime = 10;

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.get('/instructor', function(req, res) {
  res.sendFile(__dirname + '/instructor.html');
});

http.listen(8090, function() {
  console.log('listening on *:8090');
});

app.use('/dist', express.static('dist'));

io.on('connection', function(socket) {

  socket.on('joinGame', (room, email, name, nickname, callback) => {
    joinGame(socket, room, email, name, nickname, callback)
  });

  socket.on('checkAnswer', (choice, time, email) => {
    checkAnswer(socket, choice, time, email);
  })

  socket.on('leaveGame', (email) => {
    leaveGame(socket, email);
  })

  socket.on('makeGame', (room, email, callback) => {
    makeGame(socket, room, email, callback);
  })

  socket.on('changeGameState', (room, state) => {
    changeGameState(socket, state);
  })

  socket.on('deleteGame', () => {
    deleteGame(socket);
  })

  socket.on('startGame', () => {
    startGame(socket);
  })
});

function sendQuestion(socket) {
  //Score remaining & refill noResponse
  scoreLeftovers(socket);
  //Shuffle list if necessary
  if (!questionShuffleList) {
    var questionShuffleList = shuffle(questions.length);
  }
  //Get next question
  var questionIndex = questionShuffleList.pop();
  roomList[socket.room]['questionHistory'].push(questionIndex);
  var question = questions[questionIndex];
  //Save last answer & set new answer
  var pastAnswer = roomList[socket.room]['answer'];
  roomList[socket.room]['answer'] = question.correct;
  delete question.correct;
  roomList[socket.room]['question'] = question;

  if(roomList[socket.room]['interval'] == 0){//First run
    io.to(socket.room).emit('sendQuestion', question);
  } else {
    //io.to(socket.room).emit('sendAnswer', pastAnswer);
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
  roomList[socket.room]['roomState'] = 'playing';
  roomList[socket.room]['interval'] = 0;
  roomList[socket.room]['interval'] = responsesIn(roomList[socket.room]['interval'], socket);
}

function makeGame(socket, room, email, callback) {
  if (!(room in roomList)) {
    socket.join(room);
    socket.room = room;
    roomList[room] = {
      'players': [],
      roomState: 'open', //roomStates: open, closed, playing
      master: email,
      'questionHistory': [],
      'noResponse': []
    };
    callback(false);
  } else {
    callback(true);
  }
}

function joinGame(socket, room, email, name, nickname, callback) {
  if (room in roomList && roomList[room]['roomState'] == 'open') {
    socket.join(room);
    socket.room = room;

    roomList[room]['players'].push(
      {'name': name,
      'nickname': nickname,
      'score': 0,
      'socketId': socket.id,
      'email': email + roomList[room]['players'].length,
      'history': []});
    callback(false);
    //Don't send sensitive info when not necessary
    var nicks = roomList[room]['players'].map(players=>players.nickname);
    //Send nicknames to waiting rooms
    io.to(socket.room).emit('roomListUpdate', nicks);
  } else {
    callback(true)
  }
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
  roomList[socket.room]['players'].splice(roomList[socket.room]['players'].indexOf(email), 1);
  io.to(socket.room).emit('roomListUpdate', roomList[socket.room]['players']);
  socket.leave(socket.room);
}

function changeGameState(socket, state) {
  roomList[socket.room]['roomState'] = state;
}

function deleteGame(socket) {
  socket.to(socket.room).emit('roomClosed');
  //socket.leave(socket.room);
  if(roomList[socket.room]['roomState'] == 'playing'){
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
}
