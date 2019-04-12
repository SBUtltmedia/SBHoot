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

  socket.on('joinGame', (room, name, callback) => {
    joinGame(socket, room, name, callback)
  });

  socket.on('checkAnswer', (choice) => {
    checkAnswer(socket, choice);
  })

  socket.on('leaveGame', (name) => {
    leaveGame(socket, name);
  })

  socket.on('makeGame', (room, email, callback) => {
    makeGame(socket, room, email, callback);
  })

  socket.on('changeGameState', (room, state) => {
    changeGameState(socket, state);
  })

  socket.on('deleteGame', (room) => {
    deleteGame(socket, room);
  })

  socket.on('startGame', (room) => {
    startGame(socket);
  })
});

function sendQuestion(socket) {
  if (!questionShuffleList) {
    var questionShuffleList = shuffle(questions.length);
  }
  var question = questions[questionShuffleList.pop()];
  roomList[socket.room]['answer'] = question.correct;
  delete question.correct;
  roomList[socket.room]['question'] = question;
  roomList[socket.room]['noResponse'] = roomList[socket.room]['players'].length;
  io.to(socket.room).emit('sendQuestion', question);
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
  }, 20000);
  roomList[socket.room]['noResponse'] = roomList[socket.room]['players'].length;
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
      master: email
    };
    callback(false);
  } else {
    callback(true);
  }
}

function joinGame(socket, room, name, callback) {
  if (room in roomList && roomList[room]['roomState'] == 'open') {
    socket.join(room);
    socket.room = room;
    roomList[room]['players'].push(name);
    callback(false)
    io.to(socket.room).emit('roomListUpdate', roomList[room]['players']);
  } else {
    callback(true)
  }
}

function checkAnswer(socket, choice) {
  var question = roomList[socket.room]['question'];
  console.log('Player chose', question.answers[choice]);
  console.log('Correct answer was', question.answers[roomList[socket.room]['answer']]);
  //Store who answered & what
  roomList[socket.room]['noResponse']--;
  if (roomList[socket.room]['noResponse'] == 0) {
    roomList[socket.room]['interval'] = responsesIn(roomList[socket.room]['interval'], socket);
  }
}

function leaveGame(socket, name) {
  roomList[socket.room]['players'].splice(roomList[socket.room]['players'].indexOf(name), 1);
  io.to(socket.room).emit('roomListUpdate', roomList[socket.room]['players']);
  socket.leave(socket.room);
}

function changeGameState(socket, state) {
  roomList[socket.room]['roomState'] = state;
}

function deleteGame(socket, room) {
  socket.to(socket.room).emit('roomClosed');
  socket.leave(socket.room);
  delete roomList[socket.room];
}
