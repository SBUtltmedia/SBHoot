const path = require('path');
var express = require('express');
var SocketIOFileUpload = require('socketio-file-upload');
var app = express().use(SocketIOFileUpload.router);
var mysql = require('mysql');
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
const fs = require('fs');
var http = require('http').Server(app);
var io = require('socket.io')(http);
const csv=require('csvtojson');

//Connect to Database
let DBInfo = JSON.parse(fs.readFileSync('DBConnect.json'));
var con = mysql.createConnection({
  host: DBInfo.host,
  database: DBInfo.database,
  user: DBInfo.username,
  password: DBInfo.password
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

var roomList = {};
var answerTime = 10;

app.use('/dist', express.static('dist'));

app.get('*', function(req, res) {
  var url = req.url.split("/")[1]
  res.render('common', {
    clientType: url
  })
});
http.listen(8090, function() {
  console.log('listening on *:8090');
});

io.on('connection', function(socket) {
  var uploader = new SocketIOFileUpload();
  uploader.dir = "uploads/";
  uploader.listen(socket);

  // Accepts only CSV files
  uploader.uploadValidator = (event, callback) => {
    if(event.file.name.split('.')[1] != "csv"){
      sendAlert(socket, "Error: Only CSV files are accepted");
      callback(false);
    }
    else {
      callback(true);
    }
  };

  // Parse to JSON, check & change format
  uploader.on("saved", function(event) {
    callback = ()=>{};

    //Try to parse the file to our JSON format. If it fails, we know the formatting is invalid
    try{
      csv().fromFile(event.file.pathName).then((jsonObj)=>{
        questionList = [];
        for(obj in jsonObj){
          questionList.push(jsonObj.map((question)=>{
            var newQuestion = {
              question:question.Question,
              correct:parseInt(question["Correct Answer"])-1
            };
            newQuestion.answers = [question["Answer 1"], question["Answer 2"], question["Answer 3"], question["Answer 4"]]; //Object.keys(question).map(function(v) { return question[v] });
            return newQuestion;
          })[0]);
        }
        roomList[socket.room]['questions'] = questionList;
        //Create new file as JSON
        fs.writeFile(`quizzes/${socket.room}.json`, JSON.stringify(questionList), 'utf8', callback);
        //Delete file
        fs.unlink(event.file.pathName, callback);
      });
    } catch(err) {
      sendAlert(socket, "Error: The file is not in the proper format. Please reupload a properly formatted file.");
      //Delete file
      fs.unlink(event.file.pathName, callback);
    }
  });

  // Error handler:
  uploader.on("error", function(event) {
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

  socket.on('requestPreviousGames', (email) => {
    requestPreviousGames(socket, email);
  });

  socket.on('requestPreviousGamesStudent', (email) => {
    requestPreviousGamesStudent(socket, email);
  });

  socket.on('rejoinGame', (email, game, callback) => {
    rejoinGame(socket, email, game, callback);
  });

  socket.on('rejoinGameStudent', (room, email, name, nickname, callback) => {
    joinGame(socket, room, email, name, nickname, callback);
  });

  socket.on('downloadReport', ()=>{
    sendReport(socket);
  });

  socket.on('stopGame', ()=>{
    stopGame(socket);
  });

  socket.on('useDefaultQuestions', (name, callback)=>{
    useDefaultQuestions(socket, name, callback);
  })
});

// TODO:
// Break up app.js into seperate files for clarity
// Fix rejoining game lists
// Deep linking https://github.com/asual/jquery-address, http://www.asual.com/jquery/address/
// Improve queries
// Fix the 1 question delay on score & rank changes

////////////////////////////
// GAME PLAYING FUNCTIONS //
////////////////////////////

//Sends questions to students
function sendQuestion(socket) {
  //Score remaining & refill noResponse
  scoreLeftovers(socket);

  questions = roomList[socket.room]['questions'];

  //Save information thus far
  //Shuffle list if necessary
  if (!roomList[socket.room].questionShuffleList || roomList[socket.room].questionShuffleList.length==0) {
    roomList[socket.room].questionShuffleList = shuffle(questions.length);
  }
  //Get next question
  var questionIndex = roomList[socket.room].questionShuffleList.pop();
  roomList[socket.room].questionIndex = questionIndex;
  var question = questions[questionIndex];
  //Save last answer & set new answer
  var pastAnswer = roomList[socket.room]['answer'];
  roomList[socket.room]['answer'] = question.correct;
  //delete question.correct;
  roomList[socket.room]['question'] = question;

  if (roomList[socket.room]['interval'] == 0) { //First run
    io.to(socket.room).emit('sendQuestion', question);
  } else {
    sendAnswerAndPoints(socket, pastAnswer);
    setTimeout(() => {
      io.to(socket.room).emit('sendQuestion', question);
    }, 2000);
  }
}

//Resets the waiting interval once all players have answered
function responsesIn(x, socket) {
  clearInterval(x);
  sendQuestion(socket);
  x = setInterval(function() {
    sendQuestion(socket);
  }, answerTime * 1000);
  return x;
}

//Checks a student submitted answerand updates the DB to reflect how they did
function checkAnswer(socket, choice, time, email) {
  //var question = roomList[socket.room]['question'];
  var player = roomList[socket.room].players[email];
  //Store who answered & what
  var score = getPoints(socket, time, choice);
  console.log(score);

  //Record score
  questionIndex = roomList[socket.room].questionIndex;

  //Update DB
  if (score > 0) {
    con.query(`SELECT Score FROM Answer WHERE QuestionID = ? AND PlayerID = ?`,
    [questionIndex, player.playerID], (err, result)=>{
      oldScore = result[0] ? result[0].Score : 0;
      if(score > oldScore){
        con.query(`UPDATE Player
          SET NumberAnswered = NumberAnswered + 1, NumberCorrect = NumberCorrect + 1, Score = Score + ?
          WHERE PlayerID = ?`, [score-oldScore, player.playerID]);
        player.score += score - oldScore;
        //Insert new score
        con.query(`REPLACE INTO Answer VALUES(?,?,?);`,
        [player.playerID, questionIndex, score]);
      } else {
        con.query(`UPDATE Player
          SET NumberAnswered = NumberAnswered + 1, NumberCorrect = NumberCorrect + 1
          WHERE PlayerID = ?`, [player.playerID]);
      }
    });
  }

  var room = socket.room;
  //Remove answered player
  roomList[room]['noResponse'].splice(roomList[room]['noResponse'].indexOf(email), 1);
  if (roomList[room]['noResponse'].length == 0) {
    roomList[room]['interval'] = responsesIn(roomList[room]['interval'], socket);
  }
}

// Refills noResponse array
function scoreLeftovers(socket) {
  roomList[socket.room]['noResponse'] = getMapAttr(roomList[socket.room]['players'], ['email']);
}

function sendAnswerAndPoints(socket, answer) {
  //Only calculate once
  results = getMapAttr(roomList[socket.room]['players'], ['nickname', 'score']);

  //Send specifically to each connected player
  for (var key in roomList[socket.room].players) {
    var player = roomList[socket.room].players[key];
    io.to(player.socketId).emit('sendAnswer', answer, player.score, results);
  }

  //Send results to instructor
  sendProfResults(socket);
}

// Returns the number of points to award a player
// if they answer the question correctly
function getPoints(socket, time, choice) {
  if (roomList[socket.room]['answer'] == choice) {
    time -= 1;
    if (time < 0)
      time = 0;
    return Math.ceil(Math.pow((answerTime - time) / answerTime, 1.7) * 100);
  }
  return 0;
}

//Sends score results to listening instructor page
function sendProfResults(socket) {
  var socketList = io.sockets.server.eio.clients;
  //Only send instructor data if connected
  if (!(socketList[roomList[socket.room].masterSocketId] === undefined)){
    con.query('SELECT NickName, Score FROM Player WHERE RoomID = ?', [roomList[socket.room].roomId], (err, result)=>{
      io.to(roomList[socket.room].masterSocketId).emit('playerResults', result);
    });
  }
}

///////////////////////////////
// GAME MANAGEMENT FUNCTIONS //
///////////////////////////////

//Starts a game as initiated by instructor.js
function startGame(socket) {
  changeGameState(socket, 'playing');

  //Get & parse game info
  parseJSON(socket, `quizzes/${socket.room}.json`); //Parse question file

  roomList[socket.room]['noResponse'] = [];
  roomList[socket.room]['interval'] = 0;
  roomList[socket.room]['interval'] = responsesIn(roomList[socket.room]['interval'], socket);
  sendProfResults(socket);
}

//Makes a game with the creator acting as an instructor
function makeGame(socket, room, email, callback) {
  con.query(`SELECT * FROM Person WHERE Email = ? LIMIT 1`, [email], (err, result) => {
    socket.masterId = result[0].PersonID;
    con.query(`SELECT * FROM Room WHERE Name = ? LIMIT 1`, [room], (err, result) => {
      failed = result != undefined && result.length > 0;
      callback(failed);
      if (!failed) {
        socket.join(room);
        socket.room = room;
        roomList[room] = {
          players: {},
          noResponse: [],
          masterId: socket.id
        };
        con.query(`INSERT INTO Room (InstructorID, Name) VALUES (?, ?);`, [socket.masterId, room], (err, result)=>{
          //Get RoomID to make subsequent references easier
          con.query("SELECT RoomID FROM Room WHERE Name = ? LIMIT 1", [room], (err, result) =>{
            roomList[room].roomId = result[0].RoomID;
          })
        });
      }
    });
  });
}

//Handles a student joining the game
function joinGame(socket, room, email, name, nickname, callback) {
  //Check if the room is open and exists
  con.query(`SELECT * FROM Room WHERE Name = ? AND State = 'open' LIMIT 1`, [room], (err, result1) => {
    exists = result1 != undefined && result1.length > 0;
    if(!exists){
      callback(true, 'Error: Room is closed or does not exist');
    } else {
      //Get PersonID
      con.query(`SELECT PersonID FROM Person WHERE Email = ? LIMIT 1`, [email], (err, result2) => {
        personId = result2[0].PersonID;
        roomId = result1[0].RoomID;
        //Check if there is a player in the room already
        con.query(`SELECT * FROM Player WHERE NickName = ? AND RoomID = ? LIMIT 1`, [nickname, roomId], (err, result3)=>{

          //All tests have been passed
          if(!result3 || result3.length == 0 || result3[0].PersonID == personId){
            callback(false, '');

            socket.join(room);
            socket.room = room;

            roomList[room].players[email] = {
              name: name,
              nickname: nickname,
              socketId: socket.id
            };
            //Get previous score & PlayerID if exists
            roomList[room].players[email].score = result3[0] ? result3[0].Score : 0;
            roomList[room].players[email].playerID = result3[0] ? result3[0].PlayerID : undefined;

            //Send nicknames to waiting rooms
            io.to(socket.room).emit('roomListUpdate', getMapAttr(roomList[room].players, ['nickname']));

            //Add player to DB
            roomList[room].roomId = roomId;
            roomList[room].players[email].personId = personId;

            con.query(`INSERT INTO Player (PersonID, RoomID) SELECT ?, ? WHERE NOT EXISTS(SELECT * FROM Player WHERE PersonID = ? AND RoomID = ?)`,
            [personId, roomId, personId, roomId], (err, result) => {
              //Get PlayerID if player is new
              if(!roomList[room].players[email].playerID){
                con.query(`SELECT PlayerID FROM Player WHERE PersonID = ? AND RoomID = ? LIMIT 1`, [personId, roomId], (err, result)=>{
                  roomList[room].players[email].playerID = result[0].PlayerID;
                });
              }
            });
            //Update nickname seperately so rejoin can use this function too
            con.query('UPDATE Player SET NickName = ? WHERE PersonID = ? AND RoomID = ?', [nickname, personId, roomId]);
          } else {
            callback(true, 'Error: NickName is already taken');
          }
        });
      });
    }
  });
}

//Handles a student leaving the game
function leaveGame(socket, email) {
  //Make sure nobody is waiting for them to answer
  roomList[socket.room].noResponse.splice(roomList[socket.room].noResponse.indexOf(email), 1);
  delete roomList[socket.room].players[email];

  io.to(socket.room).emit('roomListUpdate', getMapAttr(roomList[socket.room]['players'], ['nickname']));
  socket.leave(socket.room);
}

function changeGameState(socket, state) {
  con.query(`UPDATE Room SET State = ? WHERE Name = ? AND InstructorID = ?`, [state, socket.room, socket.masterId]);
}

function deleteGame(socket) {
  con.query(`DELETE FROM Room WHERE Name = ? AND InstructorID = ?`, [socket.room, socket.masterId]);
  closeGameStep(socket);
  if(fs.existsSync("quizzes/" + socket.room + ".json")){
    fs.unlinkSync("quizzes/" + socket.room + ".json");
  }
  delete roomList[socket.room];
}

function stopGame(socket){
  closeGameStep(socket);
  changeGameState(socket, 'closed');
}

function closeGameStep(socket) {
  socket.to(socket.room).emit('roomClosed');
  //Stop wasting server time
  if (roomList[socket.room]['interval']) {
    clearInterval(roomList[socket.room]['interval']);
  }
  //Kick everyone from the room except instructor
  io.of('/').in(socket.room).clients((error, socketIds) => {
    if (error) throw error;
    socketIds.forEach(socketId => {
      io.sockets.sockets[socketId].leave(socket.room);
    });
  });
}

//Sends back a list of games the instructor controls to instructor.js
function requestPreviousGames(socket, email) {
  if (email == null)
    return;
  con.query('SELECT PersonID FROM Person WHERE Email = ? LIMIT 1', [email], (err, result) => {
    if (!result || result.length == 0)
      return;
    con.query("SELECT Name FROM Room WHERE InstructorID = ?", [result[0].PersonID], (err, result) => {
      io.to(socket.id).emit('returnPreviousGames', result);
    });
  });
}

//Sends a list of games a student has played in that they can rejoin to client.js
function requestPreviousGamesStudent(socket, email) {
  if (email == null)
    return;
  con.query('SELECT PersonID FROM Person WHERE Email = ? LIMIT 1', [email], (err, result) => {
    if (!result || result.length == 0)
      return;
    con.query("SELECT Name FROM Room WHERE RoomID IN (SELECT RoomID FROM Player WHERE PersonID = ?) AND State = 'open'", [result[0].PersonID], (err, result) => {
      io.to(socket.id).emit('returnPreviousGamesStudent', result);
    });
  });
}

//Handles instructor rejoining a game
function rejoinGame(socket, email, game, callback) {
  //Initialize roomList to avoid synchronicity errors
  roomList[game] = roomList[game] ? roomList[game] : {};


  con.query('SELECT RoomID, InstructorID, State FROM Room WHERE Name = ? LIMIT 1', [game], (err, result) => {
    //Get RoomID & InstructorID to make subsequent references easier
    roomList[game].roomId = result[0].RoomID;
    socket.masterId = result[0].InstructorID;

    socket.join(game);
    socket.room = game;

    //Shouldn't pile a new game onto a running one
    if(result[0].State != 'closed'){
      roomList[game].masterSocketId = socket.id;
      callback("running");
      sendProfResults(socket);
    } else {
      roomList[game] = {
        players: {}, //TODO: Save from last run?
        noResponse: [],
        masterSocketId: socket.id
      };

      changeGameState(socket, 'open');

      //See whether or not we need to display file drop
      if(fs.existsSync('quizzes/' + game + '.json')){
        callback("file drop");
        parseJSON(socket, 'quizzes/' + game + '.json');
      }
    }
  });
}

function sendReport(socket){
  room = socket.room;
  //Gets answers with identifying PersonID
  con.query(`SELECT Player.PersonID,Answer.QuestionID, Answer.Score
    FROM Player,Answer
    WHERE Player.PlayerID=Answer.PlayerID and Player.RoomID = ?;`, [roomList[room].roomId], (err1, r1)=>{
      //Gets all necessary info about people
      con.query(`SELECT p.PersonID, p.Email, p.FirstName, p.LastName, pl.NickName, pl.NumberAnswered, pl.NumberCorrect
        FROM Person p
        INNER JOIN
        (SELECT * FROM Player WHERE Player.RoomID = ?) pl
        ON p.PersonID = pl.PersonID;`, [roomList[room].roomId], (err2, r2)=>{
          io.to(socket.id).emit('sendReport', r1, r2, roomList[room].questions);
        });
    });
}

function useDefaultQuestions(socket, name, callback){
  fs.copyFile('questions.json', 'quizzes/'+ name + '.json', (err)=>{
    if(!err){
      parseJSON(socket, 'questions.json');
      callback();
    }
    else console.log(err);
  });
}

///////////////////////
// UTILITY FUNCTIONS //
///////////////////////

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

//Send alert popup to specific socket
function sendAlert(socket, info){
  io.to(socket.id).emit('sendAlert', info);
}

//Parses a given JSON file. Since the file would be critiqued when it was made, there is no need to check its validity
function parseJSON(socket, file){
  //Server has been restarted
  if(!roomList[socket.room]['questions']){
    rawdata = fs.readFileSync(file);
    roomList[socket.room]['questions'] = JSON.parse(rawdata);
  }
}

//Returns a scalar or array of specified values from a dictionary
function getMapAttr(dict, attrs) {
  if (attrs.length == 1)
    if (attrs[0] == 'email')
      return Object.keys(dict).map((key) => {
        return key
      });
    else
      return Object.keys(dict).map((key) => {
        return dict[key][attrs[0]]
      });
  else {
    return Object.keys(dict).map((key) => {
      items = [];
      for (attribute of attrs) {
        if (attribute == 'email')
          items.push(key);
        else
          items.push(dict[key][attribute]);
      }
      return items;
    });
  }
}
