var express = require('express');
var app = express();
const fs = require('fs');
var http = require('http').Server(app);
var io = require('socket.io')(http);

var currentRightAnswer;
let rawdata = fs.readFileSync('questions.json');
let questions = JSON.parse(rawdata);

var roomList = {};

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

app.get('/instructor', function(req, res){
  res.sendFile(__dirname + '/instructor.html');
});

io.on('connection', function(socket){
  socket.on('joinGame', (room, name, callback)=> {joinGame(socket, room, name, callback)});

  socket.on('leaveGame', (name)=> {leaveGame(socket, name);})

  socket.on('makeGame', (room, email, callback)=> {makeGame(socket, room, email, callback);})

  socket.on('changeGameState', (room, state)=> {changeGameState(socket, room, state)})

  socket.on('deleteGame', (room)=>{deleteGame(socket, room);})
    //check Answer
});


http.listen(8090, function(){
  console.log('listening on *:8090');
});

app.use('/dist', express.static('dist'))

function sendQuestion(){
  if(!questionShuffleList){
    var questionShuffleList = shuffle(questions.length);
  }
  var currentQuestion = questions[questionShuffleList.pop()];
  currentRightAnswer = currentQuestion.correct;
  delete currentQuestion.correct;
  io.emit('newQuestion', currentQuestion);
}

function startQuestion() {
  setInterval(sendQuestion, 1000);
}

function shuffle(length){
  var newArr = []
  var arr = Array.apply(null, {length: length}).map(Number.call, Number);
  while (arr.length) {
     var randomIndex = Math.floor(Math.random() * arr.length),
         element = arr.splice(randomIndex, 1)
     newArr.push(element[0]);
  }
  return newArr;
}

function makeGame(socket, room, email, callback) {
  if(!(room in roomList)){
    socket.join(room);
    socket.room = room;
    //roomStates: open, closed, playing
    roomList[room] = {'players': [], roomState: 'open', master: email};
    callback(false);
  } else {
    callback(true);
  }
}

function joinGame(socket, room, name, callback) {
  if(room in roomList && roomList[room]['roomState'] == 'open'){
    socket.join(room);
    socket.room = room;
    roomList[room]['players'].push(name);
    callback(false)
    io.to(socket.room).emit('roomListUpdate', roomList[room]['players']);
  } else {
    callback(true)
  }
}

function leaveGame(socket, name) {
  roomList[socket.room]['players'].splice(roomList[socket.room]['players'].indexOf(name), 1);
  io.to(socket.room).emit('roomListUpdate', roomList[socket.room]['players']);
  socket.leave(socket.room);
}

function changeGameState(socket, room, state) {
  roomList[socket.room]['roomState'] = state;
}

function deleteGame(socket, room) {
  socket.to(socket.room).emit('roomClosed');
  socket.leave(socket.room);
  delete roomList[socket.room];
}
