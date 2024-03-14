//const path = require('path');
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import express from 'express';
//const { Curl } = require('node-libcurl');
import { Curl } from "node-libcurl"
var SocketIOFileUpload = require('socketio-file-upload');
var app = express().use(SocketIOFileUpload.router);
//const sqlite3 = require('sqlite3').verbose();
import sqlite3 from "sqlite3";
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
//const fs = require('fs');
import fs from "fs";
var http = require('http').Server(app);
var io = require('socket.io')(http);
io.engine.on("connection_error", (err) => {
  console.log(err.req);      // the request object
  console.log(err.code);     // the error code, for example 1
  console.log(err.message);  // the error message, for example "Session ID unknown"
  console.log(err.context);  // some additional error context
});
const csv = require('csvtojson');
let role;

const PORT = process.env.PORT || 8080;
//Connect to Database
// let DBInfo = JSON.parse(fs.readFileSync('DBConnect.json'));
// var con = mysql.createConnection({
//   host: DBInfo.host,
//   database: DBInfo.database,
//   user: DBInfo.username,
//   password: DBInfo.password,
//   multipleStatements: true
// });
console.log("Started at", Date());
let con = new sqlite3.Database('./sbhoot.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the chinook database.');
});


//'Open' rooms w/out temp data causes issues
con.get("UPDATE Room SET State = 'closed';");

var roomList = {};

app.use('/dist', express.static('dist'));

app.get('/uploader', function(req, res) {

  const curl = new Curl();
  curl.setOpt('URL', req.url.split("url=")[1]);
  // curl.setOpt('FOLLOWLOCATION', true);

  curl.on('end', function(statusCode, data, headers) {
  res.send(data);
    this.close();
  })
  curl.on('error', curl.close.bind(curl));


  curl.perform();
  // const { statusCode, data, headers } = await curly.get()

});
// app.get("/",(req,res)=>{

//   var url = req.url.split("/")[1]
//   role=url;
//   res.render('log', {
//     clientType: url
//   })
// });



app.get('*', function(req, res) {
  var url = req.url.split("/")[1]
  console.log(url);
  res.render('common', {
    clientType: url
  })
});

if (http) {
  http.listen(PORT, function() {
    console.log('listening on *:' + PORT);
  });
} else {
  console.log(window)
}


//TODO:
// New DB user with less permissions?
// Allow professors to re-upload question files?
// Question refresh limit / non endless mode
//  Questions left
//  On Complete:
//    Allow restart? (What about players who already finished?)
//    What do players see?
//    What does the instructor see?
// Aggregate scores for percentage?

io.on("connect_error", (err) => {
  console.log(`connect_error due to ${err.message}`);
  });
io.on('connection', (socket) => {
  //let gstate = this.serverStore.getState();
  console.log("connection")
  // User connects 
  socket.once('new user', (id) => {
    console.log("SERVER RECEIVES NEW USER:", id);

  
    if (typeof gstate !== 'undefined') {
      //console.log("gstate", JSON.stringify(gstate))
      io.to(id).emit('new connection', gstate)
    }

  
    else {
      //console.log("Retrieving state from JSONFS", database.getData())
      io.to(id).emit('new connection', {})
    }
  })

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
        //Delete old file
        fs.unlink(event.file.pathName, callback);

        questionList = [];
        for (question of jsonObj) {
          var newQuestion = {
            question: question.Question,
            correct: parseInt(question["Correct Answer"]) - 1
          };
          newQuestion.answers = [question["Answer 1"], question["Answer 2"], question["Answer 3"], question["Answer 4"]].filter((answer) => {
            return answer != ""
          });
          newQuestion.time = question["Question Time"]; //Assume the user entered a time in seconds

          if (!newQuestion.answers[0] || !newQuestion.answers[1] || !newQuestion.time || isNaN(newQuestion.correct)) {
            io.to(socket.id).emit("uploadFailed", "Error: File dos not conform to standard");
            return;
          }

          // Send specific error messages
          if (newQuestion.time < 1) {
            io.to(socket.id).emit("uploadFailed", "Error: Question time cannot be less than a second");
            return;
          }
          if (!newQuestion.answers[newQuestion.correct]) {
            io.to(socket.id).emit("uploadFailed", "Error: Correct answer exceeds size of answer list");
            return;
          }

          questionList.push(newQuestion);
        }
        roomList[socket.room]['questions'] = questionList;
        //Create new file as JSON
        fs.writeFile(`quizzes/${socket.room}.json`, JSON.stringify(questionList), 'utf8', callback);
        io.to(socket.id).emit("uploadSuccessful");
      });
    } catch (err) {
      fs.unlink(event.file.pathName, callback);
      io.to(socket.id).emit("uploadFailed", "Error: File dos not conform to standard");
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
    console.log("dfgshdgfjhsdgfjdsgfsdgfjsdgfsdgfjgsdjfghjdsf")
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
    console.log("I can also do that")
    console.log(email, firstName, lastName, email)
    if (errorCheck(socket, [email, firstName, lastName], [], "MAIN_SCREEN"))
      con.get(`INSERT INTO Person (Email, FirstName, LastName) SELECT ?, ? , ? WHERE NOT EXISTS(SELECT * FROM Person WHERE Email=?)`, [email, firstName, lastName, email]);
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
    leaveGame(socket, email);
  });

  socket.on('stopGame', () => {
    if (errorCheck(socket, [socket.room], [], "MAIN_SCREEN")) {
      console.log(socket)
      stopGame(socket);
    }
  });
});

//////////////////////////
// GAME PLAYING FUNCTIONS //
//////////////////////////

//Sends questions to students
function sendQuestion(socket) {
  //Refill noResponse array
  roomList[socket.room]['noResponse'] = getMapAttr(roomList[socket.room]['players'], ['email']);

  //Shuffle list if necessary
  if (!roomList[socket.room].questionShuffleList) {
    roomList[socket.room].questionShuffleList = shuffle(roomList[socket.room]['questions'].length);
  } else {


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

function gameFinished(socket) {
  //Quiz is over
  if (roomList[socket.room].timeout) {
    clearTimeout(roomList[socket.room].timeout);
  }

  var dict = roomList[socket.room].allScores;
  var results = Object.keys(dict).map((key) => {
    return [dict[key].nickname, dict[key].score]
  });

  //TODO: Show players where they fall in the rankings

  //Send specifically to each connected player
  for (var key in roomList[socket.room].players) {
    var player = roomList[socket.room].players[key];

    if (!player.personId)
      continue;

    var score = roomList[socket.room].allScores[player.personId].score;
    io.to(player.socketId).emit('gameFinished', score, results);
  }

  //TODO: Send gameFinished to instructor
}

//Resets the waiting interval once all players have answered
function responsesIn(socket, restart) {
  // Should not wait to send question if no previous question was present
  var answerReadTime = restart ? 0 : 2000;

  clearTimeout(roomList[socket.room].timeout);

  sendAnswerAndPoints(socket);

  roomList[socket.room].timeout = setTimeout(() => {
    sendQuestion(socket);
    roomList[socket.room].timeout = setTimeout(() => {
      responsesIn(socket);
    }, roomList[socket.room].answerTime * 1000);
  }, answerReadTime);
}

//Checks a student submitted answerand updates the DB to reflect how they did
function checkAnswer(socket, choice, time, email) {
  
  var room = socket.room;
  var player = roomList[room].players[email];

  var person = roomList[room].allScores[player.personID];
  console.log(roomList, socket.room, email, choice, time, player, person)

  //Store who answered & what
  var score = getPoints(socket, time, choice);
  //Record score
  let questionIndex = roomList[room].questionIndex;

  if (score > 0) {
    let query= `UPDATE Player SET NumberAnswered = NumberAnswered + 1, NumberCorrect = NumberCorrect + 1 WHERE PersonID = ?`
    con.get(query, [player.personId]);
    //Set to 0 if question hasn't been answered yet before
    person[questionIndex] = person[questionIndex] ? person[questionIndex] : 0;

    //Player exceeded their current top score
    if (person[questionIndex] < score) {
      person.score += score - person[questionIndex];
      let query ='REPLACE INTO Answer VALUES(?,?,?,?);'
      con.get(query, [player.personId, roomList[room].roomId, questionIndex, score]);
      person[questionIndex] = score;
    }
  } else {
    let query= `UPDATE Player SET NumberAnswered = NumberAnswered + 1 WHERE PersonID = ?`
    con.get(query, [player.personId]);
  }

  //Remove answered player
  roomList[room].noResponse.splice(roomList[room].noResponse.indexOf(email), 1);
  if (roomList[room].noResponse.length == 0) {
    responsesIn(socket);
  }
}

function sendAnswerAndPoints(socket) {
  var dict = roomList[socket.room].allScores;
  var results = Object.keys(dict).map((key) => {
    return [dict[key].nickname, dict[key].score]
  });

  //Send specifically to each connected player
  for (var key in roomList[socket.room].players) {
    var player = roomList[socket.room].players[key];

    if (!player.personId)
      continue;

    var score = roomList[socket.room].allScores[player.personId].score;
    io.to(player.socketId).emit('sendAnswer', roomList[socket.room].answer, score, results);
  }

  //Send results to instructor
  sendProfResults(socket);
}

// Returns the number of points to award a player
// if they answer the question correctly
function getPoints(socket, time, choice) {
  if (roomList[socket.room]['answer'] == choice) {
    let answerTime = roomList[socket.room].answerTime;
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
    var dict = roomList[socket.room].allScores;
    io.to(roomList[socket.room].masterSocketId).emit('playerResults', Object.keys(dict).map((key) => {
      return [dict[key].nickname, dict[key].score]
    }));
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

  //Only send questions if people are around to get them
  if (Object.keys(roomList[socket.room].players).length != 0) {
    responsesIn(socket, true);
    sendProfResults(socket);
  }
}

function creatRoom(err, RoomID,PersonID, socket, room, callback)  {
  let roomExist =  RoomID !=undefined;
  callback(roomExist);
  if (!roomExist) {
    socket.masterId = PersonID;

    socket.join(room);
    socket.room = room;
    roomList[room] = {
      players: {},
      noResponse: [],
      masterSocketId: socket.id,
      allScores: {}
    };
    console.log(socket.masterId, PersonID, "insert room")

    //Add room to DB and set RoomID for the future
    let query = `INSERT INTO Room (InstructorID, Name) VALUES (?, ?)`;
    con.get(query, [socket.masterId, room], (err, result) => roomCreated(err, room));

  }

}

function roomCreated(err, room){

  if (err) {
    console.log("Failed to insert room");
  }

  let query = `SELECT RoomID FROM Room WHERE Name = ? LIMIT 1;`;
  con.get(query,
  room, (err, result) => {
     addRoomList(err, result?.roomID, room)

  });


}

function addRoomList(err, roomID, room) {
  //Get RoomID to make subsequent references easier
   roomList[room].roomID = roomID;
}

function getRoom(err,PersonID, socket, room, callback){
  console.log(PersonID, "getroom")
let query = `SELECT RoomID FROM Room WHERE Name = '${PersonID}' LIMIT 1;`
con.get(query, room, (err,result)=>{ creatRoom(err, result?.roomID, PersonID, socket, room, callback)})


}

//Makes a game with the creator acting as an instructor
function makeGame(socket, room, email, callback) {

  //Get PersonID & Check if a room w/ that name exists
  let query= `SELECT PersonID FROM Person WHERE Email = '${email}' LIMIT 1;`
  con.get(query, (err,result)=>getRoom(err,result?.PersonID, socket, room, callback))
  console.log(email, room, query, "make game")
  //con.get(`SELECT RoomID FROM Room WHERE Name = ? LIMIT 1;`, room, (err, result) => { console.log(err,result,"123")})




}

//Handles a student joining the game
function joinGame(socket, room, email, name, nickname, callback) {
  //Check for an empty room the moment the function is called
  var wasEmpty = roomList[room] && roomList[room].players ? Object.keys(roomList[room].players).length == 0 : null;
  let query=`SELECT RoomID, State FROM Room WHERE Name = '${room}' AND State != 'closed' LIMIT 1`
  //Check if the room is open and exists
  con.get(query,  (err, result) => {
    let exists = result != undefined;
    if (!exists) {
      callback({
        isError: true,
        error: 'Error: Room is closed or does not exist'
      });
    } else {
      let roomId = result.RoomID;
      let query= `SELECT PersonID FROM Person WHERE Email = '${email}' LIMIT 1`;   
      con.get(query, (err, result) => getPersonID(result?.PersonID, err, socket, room, email, name, nickname, callback,
                      roomId, result.State, wasEmpty));
    }});
}


function getPersonID(PersonID, err, socket, room, email, name, nickname, callback, roomId, roomState, wasEmpty){
  let query= `SELECT PersonID FROM Player WHERE NickName = '${nickname}' AND RoomID = '${roomId}' LIMIT 1`;
  console.log(query);
  con.get(query,(result,err)=>{;
    console.log(result)
     checkPlayerID(result?.PersonID, PersonID, err, socket, room, name, email, nickname, callback, roomId, roomState, wasEmpty);
  });
} 


function checkPlayerID(PlayerPersonID, personId, err, socket, room, name, email, nickname, callback, roomId, roomState, wasEmpty){
console.log(personId, PlayerPersonID)

  //Check if there is a player in the room already
  if (PlayerPersonID == undefined || PlayerPersonID == personId) {
    //All tests have been passed
    if (roomState == 'playing') {
      callback({
        isError: false,
        state: "PLAYING"
      });
    } else {
      callback({
        isError: false,
        state: "WAITING_ROOM"
      });
    }

    socket.join(room);
    socket.room = room;
console.log(email)
    roomList[room].players[email] = {
      name: name,
      nickname: nickname,
      socketId: socket.id,
      personId: personId
    };

    if (wasEmpty && roomState == "playing") {
      //Un halt room
      alterHalting(socket, wasEmpty);
    }

    //Send nicknames to waiting rooms
    io.to(socket.room).emit('roomListUpdate', getMapAttr(roomList[room].players, ['nickname']));

    roomList[room].roomId = roomId;

     
    //Add player to DB or update nickname, Get Previously answered questions
    let query = `INSERT INTO Player (PersonID, RoomID, NickName) VALUES('${personId}', '${roomId}', '${nickname}') ON DUPLICATE KEY UPDATE NickName = ?;`;
    con.get(query, (err, result) => { getAnswerdQuestions(room, roomId, nickname, personId)});
  } else {
    callback({
      isError: true,
      error: 'Error: NickName is already taken'
    });
  }

}

function getAnswerdQuestions(room, nickname, roomId, personId) {
  let query = `SELECT QuestionID, Score FROM Answer WHERE PersonID ? AND RoomID = ?;`;
  con.get(query, [personId, roomId], (err, result) => {
  //Only create if it doesn't exist
  if (roomList[room].allScores == undefined || !roomList[room]?.allScores[personId]) {
    //In case there is no info
    roomList[room].allScores = roomList[room].allScores || {};
    roomList[room].allScores[personId] = {
      score: 0,
      nickname: nickname
    };

    if (result) {
      for (answer of result) {
        roomList[game].allScores[personId][answer.QuestionID] = answer.Score;
        roomList[game].allScores[personId].score += answer.Score;
      }
    }
  }
  })
}

//Handles a student leaving the game
function leaveGame(socket, email) {
  //Since leave is called whenever a page is left, we need to check if they were actually in a game
  if (socket.room) {
    io.to(socket.room).emit('roomListUpdate', getMapAttr(roomList[socket.room]['players'], ['nickname']));
    socket.leave(socket.room);
    if (roomList[socket.room] && roomList[socket.room].players) {
      //Make sure nobody is waiting for them to answer
      roomList[socket.room].noResponse.splice(roomList[socket.room].noResponse.indexOf(email), 1);
      delete roomList[socket.room].players[email];

      if (Object.keys(roomList[socket.room].players).length == 0) {
        //Room is empty
        alterHalting(socket);
      }
    }
  }
}

function changeGameState(socket, state) {
  con.get(`UPDATE Room SET State = ? WHERE Name = ?`, [state, socket.room]);
}

function deleteGame(socket) {
  con.get(`DELETE FROM Room WHERE Name = ?`, [socket.room]);
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
  if (roomList[socket.room].timeout) {
    clearTimeout(roomList[socket.room].timeout);
  }
  //Kick everyone from the room except instructor
  console.log(socket.room)
  io.of('/').in(socket.room).emits((error, socketIds) => {
    if (error) throw error;
    socketIds.forEach(socketId => {
      io.sockets.sockets[socketId].leave(socket.room);
    });
  });
}

//Sends back a list of games the instructor controls to instructor.js
function requestPreviousGames(socket, email) {
  let query = `SELECT Name FROM Room WHERE InstructorID = (SELECT PersonID FROM Person WHERE Email = '${email}' LIMIT 1);`

  con.all(query, (err, result) => {
    console.log(result, email, query, "prev")
    io.to(socket.id).emit('returnPreviousGames', result);
  });
}

//Sends a list of games a student has played in that they can rejoin to client.js
function requestPreviousGamesStudent(socket, email) {
  con.get("SELECT Name FROM Room WHERE RoomID IN (SELECT RoomID FROM Player WHERE PersonID = (SELECT PersonID FROM Person WHERE Email = ? LIMIT 1)) AND State = 'open'", [email], (err, result) => {
    console.log(result);
    io.to(socket.id).emit('returnPreviousGamesStudent', result);
  });
}

//Handles instructor rejoining a game
function rejoinGame(socket, email, game, callback) {
  //Initialize roomList to avoid synchronicity errors
  roomList[game] = roomList[game] ? roomList[game] : {};

  con.all('SELECT State, RoomID, InstructorID FROM Room WHERE Name = ? LIMIT 1', [game], (err, result) => {
    //Get RoomID & InstructorID to make subsequent references easier
    console.log(result)
    roomList[game].roomId = result[0].RoomID;
    let state = result[0]?.State;
    socket.masterId = result[0].InstructorID;

    socket.join(game);
    socket.room = game;
    //TODO: Take from DB, differentiate between existed & connected
    let query = `SELECT pl.PersonID, pl.NickName, per.Email FROM Person per LEFT JOIN Player pl ON pl.PersonID = per.PersonID WHERE RoomID = '${roomList[game].roomId}';
    SELECT PersonID, QuestionID, Score FROM Answer WHERE RoomID = '${roomList[game].roomId}';`;
    console.log(query);
    con.all(`SELECT pl.PersonID, pl.NickName, per.Email FROM Person per LEFT JOIN Player pl ON pl.PersonID = per.PersonID WHERE RoomID = ?;
      SELECT PersonID, QuestionID, Score FROM Answer WHERE RoomID = ?;`,
      [roomList[game].roomId, roomList[game].roomId], (err, result) => {
console.log(result, err)
        //May not be any previous players
        if (result && !roomList[game].allScores) {
          roomList[game].allScores = {};
          //Set up player dicts
          for (person of result[0]) {
            roomList[game].allScores[person.PersonID] = {
              score: 0,
              nickname: person.NickName
            };
          }
          //May not be any previous scores
          if (result[1]) {
            for (answer of result[1]) {
              roomList[game].allScores[answer.PersonID][answer.QuestionID] = answer.Score;
              roomList[game].allScores[answer.PersonID].score += answer.Score;
            }
          }
        }
        roomList[game].masterSocketId = socket.id;
        switch (state) {
          //Shouldn't pile a new game onto a running one
          case 'playing':
            callback("running");
            sendProfResults(socket);
            io.to(socket.id).emit('playerResults', getMapAttr(roomList[game].players, ['nickname', 'score']));
            break;
          case 'open': //TODO: handle this case seperately
          default:

            roomList[game].players = roomList[game].players ? roomList[game].players : {};
            roomList[game].noResponse = [];
            changeGameState(socket, 'open');

            //See whether or not we need to display file drop
            if (fs.existsSync('quizzes/' + game + '.json')) {
              callback("file drop", 'open');
              parseJSON(socket, 'quizzes/' + game + '.json');
            } else {
              callback("", 'open');
            }
        }
      });
  });
}

function sendReport(socket) {
  room = roomList[socket.room].roomId;

  con.get(`SELECT Player.PersonID, Answer.QuestionID, Answer.Score FROM Player, Answer
    WHERE Player.PersonID = Answer.PersonID and Player.RoomID = ?;
    SELECT p.PersonID, p.Email, p.FirstName, p.LastName, pl.NickName, pl.NumberAnswered, pl.NumberCorrect
    FROM Person p INNER JOIN (SELECT * FROM Player WHERE Player.RoomID = ?) pl ON p.PersonID = pl.PersonID;`,
    [room, room], (err, result) => {
      io.to(socket.id).emit('sendReport', result[0], result[1], roomList[socket.room].questions);
    });
}

function useDefaultQuestions(socket, callback) {
  let name = socket.room;
  fs.copyFile('questions.json', 'quizzes/' + name + '.json', (err) => {
    if (!err) {
      parseJSON(socket, 'questions.json');
      callback();
    } else console.log(err);
  });
}

function kahootUpload(socket, questions, callback) {
  let name = socket.room;
  fs.writeFile('quizzes/' + name + '.json', JSON.stringify(questions), (err) => {
    if (!err) {
      roomList[name]['questions'] = questions;
      callback();
    } else console.log(err);
  });
}

function getNickname(email, game, callback) {
  con.get('SELECT NickName, RoomID FROM Player WHERE RoomID = (SELECT RoomID FROM Room WHERE Name = ? LIMIT 1) AND PersonID = (SELECT PersonID FROM Person WHERE Email = ? LIMIT 1) LIMIT 1;', [game, email], (err, result) => {
    if (!result || result.length == 0) {
      callback("bill");
    } else {
      player = result[0];
      con.get('SELECT State FROM Room WHERE RoomID = ?', [player.RoomID], (err, result) => {
        if (result[0].State != "closed") {
          callback(player.NickName, true);
        } else {
          callback(player.NickName);
        }
      });
    }
  });
}

//Starts or stops the flow of questions, such as if a room is empty
function alterHalting(socket, open) {
  room = roomList[socket.room];

  if (room.timeout)
    clearTimeout(room.timeout);

  if (open) {
    responsesIn(socket, true);
  }
}

///////////////////////
// UTILITY FUNCTIONS //
///////////////////////

//Checks for a lack of room info, may be changed later
function errorCheck(socket, needed, neededRL, state) {


  for (let item of needed) {
    if (!item) {
      io.to(socket.id).emit('serverMismatch', "Error: Server information does not reflect current client state", state);
      return false;
    }
  }
  for (let item of neededRL) {
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
  console.log(file);
  if (!roomList[socket.room]['questions']) {
    let rawdata = fs.readFileSync(file);
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
      let items = [];
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
