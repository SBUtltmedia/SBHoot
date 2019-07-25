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
const csv = require('csvtojson');

//Connect to Database
let DBInfo = JSON.parse(fs.readFileSync('DBConnect.json'));
var con = mysql.createConnection({
  host: DBInfo.host,
  database: DBInfo.database,
  user: DBInfo.username,
  password: DBInfo.password,
  multipleStatements: true
});
con.connect(function(err) {
  if (err) {
    console.error('Error connecting: ' + err.stack);
    return;
  }
  console.log('Connected as id ' + con.threadId);
});

//'Open' rooms w/out temp data causes issues
con.query("UPDATE Room SET State = 'closed';");

var roomList = {};

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


// TODO:
// Add kick functionality for the instructor
// Break up app.js into seperate files for clarity
// Deep linking https://github.com/asual/jquery-address, http://www.asual.com/jquery/address/
// Fix queries to take advantage of multiple execution
//  - Link for instructor
// Fix the 1 question delay on score & rank changes
// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Pull all questions when someone joins & alter in temporary memory. Push changes to DB in batches
// questions = {//Dict by QID
//   0: {isChanged: false, score: 0},
//   1: {isChanged: false, score: 65}
// }



io.on('connection', function(socket) {

  /////////////////////
  // FILE MANAGEMENT //
  /////////////////////

  //Uploaded CSV
  var uploader = new SocketIOFileUpload();
  uploader.dir = "uploads/";
  uploader.listen(socket);

  // Accepts only CSV files
  uploader.uploadValidator = (event, callback) => {
    if (event.file.name.split('.')[1] != "csv") {
      sendAlert(socket, "Error: Only CSV files are accepted");
      callback(false);
    } else {
      callback(true);
    }
  };

  // Parse to JSON, check & change format
  uploader.on("saved", function(event) {
    callback = () => {};

    //Try to parse the file to our JSON format. If it fails, we know the formatting is invalid
    try {
      csv().fromFile(event.file.pathName).then((jsonObj) => {
        questionList = [];
        for (obj in jsonObj) {
          questionList.push(jsonObj.map((question) => {
            var newQuestion = {
              question: question.Question,
              correct: parseInt(question["Correct Answer"]) - 1
            };
            newQuestion.answers = [question["Answer 1"], question["Answer 2"], question["Answer 3"], question["Answer 4"]]; //Object.keys(question).map(function(v) { return question[v] });
            newQuestion.time = question["Question Time"] * 1000; //Assume the user entered a time in seconds
            return newQuestion;
          })[0]);
        }
        roomList[socket.room]['questions'] = questionList;
        //Create new file as JSON
        fs.writeFile(`quizzes/${socket.room}.json`, JSON.stringify(questionList), 'utf8', callback);
        //Delete file
        fs.unlink(event.file.pathName, callback);
      });
    } catch (err) {
      sendAlert(socket, "Error: The file is not in the proper format. Please reupload a properly formatted file.");
      //Delete file
      fs.unlink(event.file.pathName, callback);
    }
  });

  // Error handler:
  uploader.on("error", function(event) {
    console.log("Error from uploader", event);
  });

  socket.on('downloadReport', () => {
    if (errorCheck(socket, [socket.room], [], "MAIN_SCREEN"))
      sendReport(socket);
  });

  socket.on('useDefaultQuestions', (callback) => {
    if (errorCheck(socket, [socket.room], [], "MAIN_SCREEN"))
      useDefaultQuestions(socket, callback);
  });

  socket.on('kahootUpload', (questions, callback) => {
    if (errorCheck(socket, [socket.room], [], "MAIN_SCREEN"))
      kahootUpload(socket, questions, callback);
  });


  /////////////////////
  // GAME MANAGEMENT //
  /////////////////////

  socket.on('joinGame', (room, email, name, nickname, callback) => {
    joinGame(socket, room, email, name, nickname, callback)
  });

  socket.on('makeGame', (room, email, callback) => {
    makeGame(socket, room, email, callback);
  });

  socket.on('changeGameState', (state) => {
    if (errorCheck(socket, [socket.room, socket.masterId], [], "MAIN_SCREEN"))
      changeGameState(socket, state);
  });

  socket.on('deleteGame', () => {
    if (errorCheck(socket, [socket.room], [], "MAIN_SCREEN"))
      deleteGame(socket);
  });

  socket.on('startGame', () => {
    if (errorCheck(socket, [socket.room], [], "MAIN_SCREEN"))
      startGame(socket);
  });

  socket.on('logUser', (email, firstName, lastName) => {
    if (errorCheck(socket, [email, firstName, lastName], [], "MAIN_SCREEN"))
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

  socket.on('getNickname', (email, game, callback) => {
    getNickname(email, game, callback);
  });

  //////////////////
  // GAME PLAYING //
  //////////////////

  socket.on('checkAnswer', (choice, time, email) => {
    if (errorCheck(socket, [socket.room, roomList[socket.room]], ['questions'], "MAIN_SCREEN"))
      checkAnswer(socket, choice, time, email);
  });

  socket.on('leaveGame', (email) => {
    if (errorCheck(socket, [socket.room, roomList[socket.room]], ['noResponse'], "MAIN_SCREEN"))
      leaveGame(socket, email);
  });

  socket.on('stopGame', () => {
    if (errorCheck(socket, [socket.room], [], "MAIN_SCREEN"))
      stopGame(socket);
  });
});

////////////////////////////
// GAME PLAYING FUNCTIONS //
////////////////////////////

//Sends questions to students
function sendQuestion(socket) {
  //Refill noResponse array
  roomList[socket.room]['noResponse'] = getMapAttr(roomList[socket.room]['players'], ['email']);

  //Shuffle list if necessary
  if (!roomList[socket.room].questionShuffleList || roomList[socket.room].questionShuffleList.length == 0) {
    roomList[socket.room].questionShuffleList = shuffle(roomList[socket.room]['questions'].length);
  }

  //Get next question
  var questionIndex = roomList[socket.room].questionShuffleList.pop();
  roomList[socket.room].questionIndex = questionIndex;
  var question = roomList[socket.room].questions[questionIndex];

  //Save last answer & set new answer
  roomList[socket.room].answer = question.correct;
  roomList[socket.room].question = question;
  roomList[socket.room].answerTime = question.time;

  io.to(socket.room).emit('sendQuestion', question, question.time);
}

//Resets the waiting interval once all players have answered
function responsesIn(socket) {
  var answerReadTime = 2000;

  clearInterval(roomList[socket.room].interval);
  clearTimeout(roomList[socket.room].timeoutTemp);
  sendAnswerAndPoints(socket);

  //Send question immediately on the first run,
  //but wait for the answer every time thereafter
  if (roomList[socket.room].timeoutTemp)
    setTimeout(() => sendQuestion(socket), answerReadTime);
  else sendQuestion(socket);

  //Since the first question has already handled the answer delay,
  //we should only wait for the actual answer time
  roomList[socket.room].timeoutTemp = setTimeout(() => {
    sendAnswerAndPoints(socket);
    setTimeout(() => sendQuestion(socket), answerReadTime);

    //Wait the full time + time to read the answer
    roomList[socket.room].interval = setInterval(() => {
      sendAnswerAndPoints(socket);
      setTimeout(() => sendQuestion(socket), answerReadTime);
    }, (roomList[socket.room].answerTime * 1000) + answerReadTime);
  }, (roomList[socket.room].answerTime * 1000));
}

//Checks a student submitted answerand updates the DB to reflect how they did
function checkAnswer(socket, choice, time, email) {
  var player = roomList[socket.room].players[email];
  //Store who answered & what
  var score = getPoints(socket, time, choice);
  //Record score
  questionIndex = roomList[socket.room].questionIndex;

  //Update DB
  if (score > 0) {
    con.query(`SELECT Score FROM Answer WHERE QuestionID = ? AND PlayerID = ? LIMIT 1`,
      [questionIndex, player.playerID], (err, result) => {
        oldScore = result[0] ? result[0].Score : 0;
        if (score > oldScore) {
          con.query(`UPDATE Player
          SET NumberAnswered = NumberAnswered + 1, NumberCorrect = NumberCorrect + 1, Score = Score + ?
          WHERE PlayerID = ?`, [score - oldScore, player.playerID]);
          player.score += score - oldScore;
          //Insert new score
          con.query('REPLACE INTO Answer VALUES(?,?,?);', [player.playerID, questionIndex, score]);
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
    responsesIn(socket);
  }
}

function sendAnswerAndPoints(socket) {
  results = getMapAttr(roomList[socket.room]['players'], ['nickname', 'score']);

  //Send specifically to each connected player
  for (var key in roomList[socket.room].players) {
    var player = roomList[socket.room].players[key];
    console.log("Score sent", player.score);
    io.to(player.socketId).emit('sendAnswer', roomList[socket.room].answer, player.score, results);
  }

  //Send results to instructor
  sendProfResults(socket);
}

// Returns the number of points to award a player
// if they answer the question correctly
function getPoints(socket, time, choice) {
  if (roomList[socket.room]['answer'] == choice) {
    answerTime = roomList[socket.room].answerTime / 1000;
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
  if (!(socketList[roomList[socket.room].masterSocketId] === undefined)) {
    con.query('SELECT NickName, Score FROM Player WHERE RoomID = ?', [roomList[socket.room].roomId], (err, result) => {
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
  responsesIn(socket);
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
        con.query(`INSERT INTO Room (InstructorID, Name) VALUES (?, ?);`, [socket.masterId, room], (err, result) => {
          //Get RoomID to make subsequent references easier
          con.query("SELECT RoomID FROM Room WHERE Name = ? LIMIT 1", [room], (err, result) => {
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
  con.query("SELECT RoomID, State FROM Room WHERE Name = ? AND State != 'closed' LIMIT 1", [room], (err, result1) => {
    exists = result1 != undefined && result1.length > 0;
    if (!exists) {
      callback({
        isError: true,
        error: 'Error: Room is closed or does not exist'
      });
    } else {
      roomId = result1[0].RoomID;
      //Get
      con.query("SELECT PersonID FROM Person WHERE Email = ? LIMIT 1;SELECT * FROM Player WHERE NickName = ? AND RoomID = ? LIMIT 1;", [email, nickname, roomId], (err, result2) => {
        personId = result2[0][0].PersonID;

        //Check if there is a player in the room already
        if (!result2[1] || result2[1].length == 0 || result2[1][0].PersonID == personId) {
          //All tests have been passed
          if (result1[0].State == 'playing') {
            callback({isError: false, state: "PLAYING"});
          } else {
            callback({isError: false, state: "WAITING_ROOM"});
          }

          socket.join(room);
          socket.room = room;

          roomList[room].players[email] = {
            name: name,
            nickname: nickname,
            socketId: socket.id
          };
          //Get previous score & PlayerID if exists
          roomList[room].players[email].score = result2[1] ? result2[1][0].Score : 0;
          roomList[room].players[email].playerID = result2[1] ? result2[1][0].PlayerID : undefined;

          //Send nicknames to waiting rooms
          io.to(socket.room).emit('roomListUpdate', getMapAttr(roomList[room].players, ['nickname']));

          roomList[room].roomId = roomId;
          roomList[room].players[email].personId = personId;

          //Add player to DB or update nickname, Get Previously answered questions
          con.query(`INSERT INTO Player (PersonID, RoomID, NickName) VALUES(?, ?, ?) ON DUPLICATE KEY UPDATE NickName = ?;
          SELECT PlayerID FROM Player WHERE PersonID = ? AND RoomID = ? LIMIT 1;
          SELECT QuestionID, Score FROM Answer WHERE PlayerID = (SELECT PlayerID FROM Player WHERE PersonID = ? AND RoomID = ? LIMIT 1);`,
          [personId, roomId, nickname, nickname, personId, roomId, personId, roomId], (err, result)=>{
            roomList[room].players[email].playerID = result[1][0].PlayerID;

            roomList[room].players[email].answers = {};
            for(answer of result[2]){
              roomList[room].players[email].answers[answer.QuestionID] = answer.Score;
            }
          });
        } else {
          callback({
            isError: true,
            error: 'Error: NickName is already taken'
          });
        }
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
  if (fs.existsSync("quizzes/" + socket.room + ".json")) {
    fs.unlinkSync("quizzes/" + socket.room + ".json");
  }
  delete roomList[socket.room];
}

function stopGame(socket) {
  closeGameStep(socket);
  changeGameState(socket, 'closed');
}

function closeGameStep(socket) {
  socket.to(socket.room).emit('roomClosed');
  //Stop wasting server time
  if (roomList[socket.room].interval) {
    clearInterval(roomList[socket.room].interval);
    clearTimeout(roomList[socket.room].timeoutTemp);
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
  con.query("SELECT Name FROM Room WHERE InstructorID = (SELECT PersonID FROM Person WHERE Email = ? LIMIT 1)", [email], (err, result) => {
    io.to(socket.id).emit('returnPreviousGames', result);
  });
}

//Sends a list of games a student has played in that they can rejoin to client.js
function requestPreviousGamesStudent(socket, email) {
  con.query("SELECT Name FROM Room WHERE RoomID IN (SELECT RoomID FROM Player WHERE PersonID = (SELECT PersonID FROM Person WHERE Email = ? LIMIT 1)) AND State = 'open'", [email], (err, result) => {
    io.to(socket.id).emit('returnPreviousGamesStudent', result);
  });
}

//Handles instructor rejoining a game
function rejoinGame(socket, email, game, callback) {
  //Initialize roomList to avoid synchronicity errors
  roomList[game] = roomList[game] ? roomList[game] : {};

  con.query('SELECT State, RoomID, InstructorID, State FROM Room WHERE Name = ? LIMIT 1', [game], (err, result) => {
    //Get RoomID & InstructorID to make subsequent references easier
    roomList[game].roomId = result[0].RoomID;
    socket.masterId = result[0].InstructorID;

    socket.join(game);
    socket.room = game;

    switch (result[0].State) {
      //Shouldn't pile a new game onto a running one
      case 'playing':
        roomList[game].masterSocketId = socket.id;
        callback("running");
        sendProfResults(socket);
        io.to(socket.id).emit('playerResults', getMapAttr(roomList[game].players, ['nickname']));
        break;
      case 'open': //TODO: handle this case seperately
      default:
        state = result[0].State;
        roomList[game] = { //TODO: Take from DB, differentiate between existed & connected
          players: {},
          noResponse: [],
          masterSocketId: socket.id
        };

        //See whether or not we need to display file drop
        if (fs.existsSync('quizzes/' + game + '.json')) {
          callback("file drop", state);
          parseJSON(socket, 'quizzes/' + game + '.json');
        } else {
          callback("", state);
        }
    }
  });
}

function sendReport(socket) {
  room = socket.room;
  //Gets answers with identifying PersonID
  con.query(`SELECT Player.PersonID,Answer.QuestionID, Answer.Score
    FROM Player,Answer
    WHERE Player.PlayerID=Answer.PlayerID and Player.RoomID = ?;`, [roomList[room].roomId], (err1, r1) => {
    //Gets all necessary info about people
    con.query(`SELECT p.PersonID, p.Email, p.FirstName, p.LastName, pl.NickName, pl.NumberAnswered, pl.NumberCorrect
        FROM Person p
        INNER JOIN
        (SELECT * FROM Player WHERE Player.RoomID = ?) pl
        ON p.PersonID = pl.PersonID;`, [roomList[room].roomId], (err2, r2) => {
      io.to(socket.id).emit('sendReport', r1, r2, roomList[room].questions);
    });
  });
}

function useDefaultQuestions(socket, callback) {
  name = socket.room;
  fs.copyFile('questions.json', 'quizzes/' + name + '.json', (err) => {
    if (!err) {
      parseJSON(socket, 'questions.json');
      callback();
    } else console.log(err);
  });
}

function kahootUpload(socket, questions, callback) {
  name = socket.room;
  fs.writeFile('quizzes/' + name + '.json', JSON.stringify(questions), (err) => {
    if (!err) {
      roomList[name]['questions'] = questions;
      callback();
    } else console.log(err);
  });
}

function getNickname(email, game, callback) {
  con.query('SELECT NickName, RoomID FROM Player WHERE RoomID = (SELECT RoomID FROM Room WHERE Name = ? LIMIT 1) AND PersonID = (SELECT PersonID FROM Person WHERE Email = ? LIMIT 1) LIMIT 1', [game, email], (err, result) => {
    if (!result || result.length == 0) {
      callback("bill");
    } else {
      player = result[0];
      con.query('SELECT State FROM Room WHERE RoomID = ?', [player.RoomID], (err, result) => {
        if (result[0].State != "closed") {
          callback(player.NickName, true);
        } else {
          callback(player.NickName);
        }
      });
    }
  });
}

///////////////////////
// UTILITY FUNCTIONS //
///////////////////////

//Checks for a lack of room info, may be changed later
function errorCheck(socket, needed, neededRL, state) {
  for (item of needed) {
    if (!item) {
      io.to(socket.id).emit('serverMismatch', "Error: Server information does not reflect current client state", state);
      return false;
    }
  }
  for (item of neededRL) {
    if (!roomList[socket.room][item]) {
      io.to(socket.id).emit('serverMismatch', "Error: Server information does not reflect current client state", state);
      return false;
    }
  }
  return true;
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

//Send alert popup to specific socket
function sendAlert(socket, info) {
  io.to(socket.id).emit('sendAlert', info);
}

//Parses a given JSON file. Since the file would be critiqued when it was made, there is no need to check its validity
function parseJSON(socket, file) {
  //Server has been restarted
  if (!roomList[socket.room]['questions']) {
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
