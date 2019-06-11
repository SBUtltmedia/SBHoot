const path = require('path')
var express = require('express');
var SocketIOFileUpload = require('socketio-file-upload');
var app = express().use(SocketIOFileUpload.router);
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
app.post('/upload',function (req, res){
    var form = new formidable.IncomingForm();

    form.parse(req);

    form.on('fileBegin', function (name, file){
        file.path = __dirname + '/uploads/' + file.name;
    });

    form.on('file', function (name, file){
        console.log('Uploaded ' + file.name);
    });
});

app.use('/dist', express.static('dist'));

app.get('*', function(req, res) {
  var url = req.url.split("/")[1]
  res.render('common', { clientType: url})
});

http.listen(8090, function() {
  console.log('listening on *:8090');
});

io.on('connection', function(socket) {

  var uploader = new SocketIOFileUpload();
     uploader.dir = "uploads";
     uploader.listen(socket);

     // Do something when a file is saved:
     uploader.on("saved", function(event){
         console.log(event.file);
     });

     // Error handler:
     uploader.on("error", function(event){
         console.log("Error from uploader", event);
     });


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

  //Add user to DB if they don't exist
  socket.on('logUser', (email, firstName, lastName) => {
    con.query(`INSERT INTO Person (Email, FirstName, LastName) SELECT ?, ? , ? WHERE NOT EXISTS(SELECT * FROM Person WHERE Email=?)`, [email, firstName, lastName, email]);
  });

  socket.on('requestPreviousGames', (email) =>{
    requestPreviousGames(socket, email);
  });

  socket.on('requestPreviousGamesStudent', (email) =>{
    requestPreviousGamesStudent(socket, email);
  });

  socket.on('rejoinGame', (email, game, nickname) =>{
    rejoinGame(socket, email, game, nickname);
  });

  socket.on('rejoinGameStudent', (room, email, name, nickname, callback) =>{
    joinGame(socket, room, email, name, nickname, callback);
  });
});

// TODO:
// Display game report to instructor
// CSV Question, correct, answers(variable), columnsAnsw

//Sends questions to students
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

//Resets the waiting interval once all players have answered
function responsesIn(x, socket){
  clearInterval(x);
  sendQuestion(socket);
  x = setInterval(function() {
    sendQuestion(socket);
  }, answerTime * 1000);
  return x;
}

//Starts a game as initiated by instructor.js
function startGame(socket) {
  changeGameState(socket, 'playing');
  roomList[socket.room]['noResponse'] = [];
  roomList[socket.room]['interval'] = 0;
  roomList[socket.room]['interval'] = responsesIn(roomList[socket.room]['interval'], socket);
  sendProfResults(socket);
}

//Makes a game with the creator acting as an instructor
function makeGame(socket, room, email, callback) {
  con.query(`SELECT * FROM Person WHERE Email = ?`, [email], (err, result) => {
    socket.masterId = result[0].PersonID;
    con.query(`SELECT * FROM Room WHERE InstructorID = ? AND Name = ?`, [socket.masterId, room], (err, result)=>{
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
        con.query(`INSERT INTO Room (InstructorID, Name) VALUES (?, ?);`, [socket.masterId, room]);
      }
    });
  });
}

//Handles a student joining the game
function joinGame(socket, room, email, name, nickname, callback) {
  con.query(`SELECT * FROM Room WHERE Name = ? AND State = 'open'`, [room], (err, result)=>{
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

      //Add player to DB
      roomId = result[0].RoomID;
      roomList[room].roomId = roomId;
      con.query(`SELECT * FROM Person WHERE Email = ?`, [email], (err, result)=>{
        personId = result[0].PersonID;
        roomList[room].players[email].personId = personId;
        con.query(`INSERT INTO Player (PersonID, RoomID)
        SELECT ?, ?
        WHERE NOT EXISTS(SELECT * FROM Player WHERE PersonID = ? AND RoomID = ?)`, [personId, roomId, personId, roomId]);0
        //Update nickname seperately so rejoin can use this function too
        con.query('UPDATE Player SET NickName = ? WHERE PersonID = ? AND RoomID = ?', [nickname, personId, roomId]);
      });
    }
  });
}

//Checks a student submitted answerand updates the DB to reflect how they did
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
      SET NumberAnswered = NumberAnswered + 1, NumberCorrect = NumberCorrect + 1, Score = Score + ?
      WHERE PersonID = ? AND RoomID = ?`, [score, roomList[room].players[email].personId, roomList[room].roomId]);
  } else {
    con.query(`UPDATE Player
      SET NumberAnswered = NumberAnswered + 1
      WHERE PersonID = ? AND RoomID = ?`, [roomList[room].players[email].personId, roomList[room].roomId]);
  }

  //Remove answered player
  roomList[socket.room]['noResponse'].splice(roomList[socket.room]['noResponse'].indexOf(email), 1);
  if (roomList[socket.room]['noResponse'].length == 0) {
    roomList[socket.room]['interval'] = responsesIn(roomList[socket.room]['interval'], socket);
  }
}

//Handles a student leaving the game
function leaveGame(socket, email) {
  //Make sure nobody is waiting for them to answer
  roomList[socket.room]['noResponse'].splice(roomList[socket.room]['players'].indexOf(email), 1);
  delete roomList[socket.room]['players'][email];

  //Set DB inRoom state to false
  con.query(`SELECT * FROM Person WHERE Email = ?`, [email],(err, result)=>{
    personId = result[0].PersonID;
    con.query(`UPDATE Player SET inRoom = false WHERE PersonID = ?`, [personId]);
  });

  io.to(socket.room).emit('roomListUpdate', getMapAttr(roomList[socket.room]['players'], ['nickname']));
  socket.leave(socket.room);
}

function changeGameState(socket, state) {
  con.query(`UPDATE Room SET State = ? WHERE Name = ? AND InstructorID = ?`, [state, socket.room, socket.masterId]);
}

function deleteGame(socket) {
  socket.to(socket.room).emit('roomClosed');

  con.query(`DELETE FROM Room WHERE Name = ? AND InstructorID = ?`, [socket.room, socket.masterId]);

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
      WHERE PersonID = ? AND RoomID = ?`, [roomList[socket.room].players[person].personId, roomList[socket.room].roomId]);
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

//Sends score results to listening instructor page
function sendProfResults(socket){
  io.to(roomList[socket.room].masterId).emit('playerResults', getMapAttr(roomList[socket.room]['players'], ['name', 'nickname', 'score', 'email']));
}

//Sends back a list of games the instructor controls to instructor.js
function requestPreviousGames(socket, email){
  if(email == null)
    return;
  con.query('SELECT * FROM Person WHERE Email = ?', [email], (err, result)=>{
      if(!result || result.length == 0)
        return;
      con.query("SELECT * FROM Room WHERE InstructorID = ?", [result[0].PersonID], (err, result) =>{
          io.to(socket.id).emit('returnPreviousGames', result);
        });
    });
}

//Sends a list of games a student has played in that they can rejoin to client.js
function requestPreviousGamesStudent(socket, email){
  if(email == null)
    return;
  con.query('SELECT * FROM Person WHERE Email = ?', [email], (err, result)=>{
      if(!result || result.length == 0)
        return;
      con.query("SELECT *  FROM Room  WHERE RoomID  IN (SELECT RoomID FROM Player WHERE PersonID = ?) AND State = 'open'", [result[0].PersonID], (err, result) =>{
        io.to(socket.id).emit('returnPreviousGamesStudent', result);
      });
    });
}

//Handles instructor rejoining a game
function rejoinGame(socket, email, game){
  con.query('SELECT * FROM Person WHERE Email = ?', [email], (err, result) => {
    socket.masterId = result[0].PersonID;
    socket.join(game);
    socket.room = game;
    roomList[game] = {
      players: {},
      noResponse: [],
      masterId: socket.id
    };
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
