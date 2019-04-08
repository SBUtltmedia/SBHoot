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


// sendQuestion();
// startQuestion();
// console.log(questions.length);

io.on('connection', function(socket){
  console.log('a user connected');

  socket.on('checkAnswer', (guess)=>{
    if(guess == currentRightAnswer){

    }
  })

  socket.on('joinGame', (room, name, callback)=>{
    if(room in roomList){
      console.log(room, name);
      socket.join(room);
      socket.room = room;
      roomList[room]['players'] += name;
      callback(false)
      io.to(socket.room).emit('roomListUpdate', roomList[room]['players']);
    } else {
      callback(true)
    }

    // //Send room info
  });

  socket.on('leaveGame', (name)=> {
    roomList[socket.room]['players'].splice(roomList[socket.room]['players'].indexOf(name), 1);
    io.to(socket.room).emit('roomListUpdate', roomList[room]['players']);
  })

  socket.on('makeGame', (room, callback)=>{
    if(!(room in roomList)){
      socket.join(room);
      socket.room = room;
      roomList[room] = {'players': []};
      callback(false);
    } else {
      callback(true);
    }
  })
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
