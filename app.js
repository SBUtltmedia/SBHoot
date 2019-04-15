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
var answerTime = 20;

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

  socket.on('joinGame', (room, name, nickname, callback) => {
    joinGame(socket, room, name, nickname, callback)
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
  //Shuffle list if necessary
  if (!questionShuffleList) {
    var questionShuffleList = shuffle(questions.length);
  }
  //Get next question
  var question = questions[questionShuffleList.pop()];
  //Save last answer & set new answer
  var pastAnswer = roomList[socket.room]['answer'];
  roomList[socket.room]['answer'] = question.correct;
  delete question.correct;
  roomList[socket.room]['question'] = question;
  //Keep track of who still needs to answer
  roomList[socket.room]['noResponse'] = roomList[socket.room]['players'].length;
  //Reset timer
  roomList[socket.room]['timer'] = 0;
  if(roomList[socket.room]['interval'] == 0){//First run
    io.to(socket.room).emit('sendQuestion', question);
  } else {
    io.to(socket.room).emit('sendAnswer', pastAnswer);
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
  roomList[socket.room]['noResponse'] = roomList[socket.room]['players'].length;
  return x;
}

function startGame(socket) {
  roomList[socket.room]['roomState'] = 'playing';
  roomList[socket.room]['interval'] = 0;
  roomList[socket.room]['interval'] = responsesIn(roomList[socket.room]['interval'], socket);
  //Increment timer every second
  timer = setInterval(()=>{roomList[socket.room]['timer']++;}, 1000);
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

function joinGame(socket, room, name, nickname, callback) {
  if (room in roomList && roomList[room]['roomState'] == 'open') {
    socket.join(room);
    socket.room = room;

    roomList[room]['players'].push({'name': name, 'nickname': nickname, 'score': 0, 'history': []});
    callback(false)
    //Don't send sensitive info when not necessary
    tempArr = [];
    for(player of roomList[room]['players']){
      tempArr.push(player['nickname']);
    }
    io.to(socket.room).emit('roomListUpdate', tempArr);
  } else {
    callback(true)
  }
}

function checkAnswer(socket, choice) {
  var question = roomList[socket.room]['question'];
  if(roomList[socket.room]['answer'] == choice){
    console.log('Correct answer scored', getPoints(socket));
  }
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

function getPoints(socket) {
  time = roomList[socket.room]['timer'] - 3;
  if(time < 0)
    time = 0;
  return Math.ceil(Math.pow((answerTime - time) / answerTime,1.5) * 100);
}
