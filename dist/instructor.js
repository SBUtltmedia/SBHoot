$("#makeGame").on(listeners, makeGame);
$("#openGame").on(listeners, openGame);
$("#closeGame").on(listeners, closeGame);
$("#deleteGame").on(listeners, deleteGame);
$("#startGame").on(listeners, startGame);
$("#stopGame").on(listeners, stopGame);
$("#leaveGame").on(listeners, leaveGame);
$("#downloadReport").on(listeners, downloadReport);
$("#useDefaultQuestions").on(listeners, useDefaultQuestions);
$("#uploadKahoot").on(listeners, uploadFromKahoot);

// Allows a user to upload a file
var siofu = new SocketIOFileUpload(socket);
siofu.listenOnDrop(document.getElementById("file_drop"));

// Do something when a file is uploaded:
siofu.addEventListener("complete", (event) => {
  changeDisplay(['#startGame', '#downloadReport'], ['#questionFile']);
});

function useDefaultQuestions(){
  socket.emit('useDefaultQuestions', state.gameName, ()=>{
    changeDisplay(['#startGame', '#downloadReport'], ['#questionFile']);
  });
}

function uploadFromKahoot() {
  url = $("#kahootURL")[0].value.split("/");
  id = url[url.length - 1];
  sendAlert("Uploading file from Kahoot...");
  try {
    $.get(`http://proxy.fenetik.com?url=${id}`,(data)=>{
      //Parse on client side to reduce server load
      var questions = JSON.parse(data).questions;
      var parsedQuestions = [];
      for(var i = 0; i < questions.length; i++){
        question = questions[i];
        parsedQuestion = {
          question: question.question,
          answers: [],
          time: question.time
        };
        for(var j = 0; j < question.choices.length; j++){
          choice = question.choices[j]
          if(choice.correct){
            if(!parsedQuestion.correct){
              parsedQuestion.correct = j;
            } else {
              i = questions.length;
              break;
              sendAlert("Error: SBHoot only accepts questions with one correct answer");
            }
          }
          parsedQuestion.answers.push(choice.answer);
        }
        parsedQuestions.push(parsedQuestion);
      }
      socket.emit('kahootUpload', state.gameName, parsedQuestions, ()=>{
        closeAlert();
        changeDisplay(['#startGame', '#downloadReport'], ['#questionFile']);
      })
    });
  } catch(err) {
    sendAlert("Error: invalid URL");
  }
}

socket.on('playerResults', playerResults);
socket.on('returnPreviousGames', displayPrevGames);
socket.on('sendReport', sendReport);
//socket.on('disconnect', handleDisconnect);

function handleDisconnect() {
  changeDisplay(['#gameCreation'], ['#gameManagement']);
  sendAlert("Error: Disconnected from server");
}

//Request previous games as soon as they're available
var x = setInterval(emailCheck, 25);

function emailCheck() {
  if (email) {
    clearInterval(x);
    requestPrevGames();
  }
}

function requestPrevGames() {
  socket.emit('requestPreviousGames', email);
}

function displayPrevGames(games) {
  if (games.length == 0)
    $('#rejoin').text('No previous games')
  else {
    $('#previousGames').empty();
    for (game of games) {
      $('#previousGames').append('<li><button class="rejoinGame" id="' + game.Name + '" type="button">Join</button>\t' + game.Name + '</li>');
    }
    $(".rejoinGame").on(listeners, rejoinGame);
  }
}

function rejoinGame() {
  if (socket.connected) {
    state.gameName = this.id;
    $('.state.gameName').text(state.gameName);
    changeDisplay(['#gameManagement', '#downloadReport'], ['#gameCreation']);

    callback = (input) => {
      //Jump right to playing if the game was left in motion
      if(input == "running"){
        changeDisplay(['#playerResults', '#stopGame'], ['#startGame', "#playerList"]);
      }
      //See whether or not we need to display file drop
      else if (input == "file drop") {
        changeDisplay(['#startGame'], ['#questionFile']);
      }
    }

    socket.emit('rejoinGame', email, this.id, callback);
  } else {
    sendAlert("Error: Not connected to server");
  }
}

function makeGame() {
  if (socket.connected) {
    logUser(email, firstName, lastName);
    socket.emit('makeGame', $('#roomId').val(), email, (error) => {
      if (!error) {
        state.gameName = $('#roomId').val();
        $('#state.gameName').text(state.gameName);
        changeDisplay(['#gameManagement', '#questionFile'], ['#gameCreation']);
      } else {
        sendAlert('Error: Game already exists!');
      }
    });
  } else {
    sendAlert("Error: Not connected to server");
  }
}

function openGame() {
  socket.emit('changeGameState', state.gameName, 'open');
  changeDisplay(['#closeGame', '#startGame'], ['#openGame']);
}

function closeGame() {
  socket.emit('changeGameState', state.gameName, 'closed');
  changeDisplay(['#openGame'], ['#closeGame']);
}

function deleteGame() {
  if (confirm('Are you sure you want to delete ' + state.gameName + '?')) {
    socket.emit('deleteGame');
    $('#playerList').empty();
    state.roomSize = 0;
    changeDisplay(['#gameCreation'], ['#gameManagement']);
    requestPrevGames(email);
  }
}

function startGame() {
  //Must have at least 1 player to start
  if (state.roomSize > 0) {
    socket.emit('startGame');
    changeDisplay(['#playerResults', '#stopGame'], ['#startGame', "#playerList"]);
  } else {
    sendAlert("Error: cannot start a game with no players");
  }
}

function stopGame() {
  socket.emit('stopGame');
  $('ul#playerList li').empty();
  changeDisplay(['#startGame', '#openGame'], ['#stopGame', '#closeGame']);
}

function leaveGame(){
  $('#playerList').empty();
  state.roomSize = 0;
  changeDisplay(['#gameCreation'], ['#gameManagement']);
  requestPrevGames(email);
}

function playerResults(results) {
  if ($('#playerResults tr').length == 0) {
    $('#playerResults').append('<tr><th>Nickname</th><th>Score</th></tr>');
    for (player of results) {
      tr = '<tr id="' + getSelector(player.NickName) + '"><td>' + player.NickName + '</td><td class="score">' + player.Score + '</td></tr>';
      $('#playerResults').append(tr);
    }
  } else {
      for (player of results) {
        $("#" + getSelector(player.NickName) + ' td.score').text(player.Score);
      }
  }
}

function downloadReport() {
  socket.emit('downloadReport');
}

function getSelector(input) {
  return input.replace(/[@.]/gi, '_');
}

function sendReport(questionResponses, people, questions) {
  //Final location for CSV Rows
  data = [];

  //Column names
  columns = [
    'First Name',
    'Last Name',
    'Email',
    'Nickname',
    'Score',
    'Number Answered',
    'Number Correct',
  ];

  //Add question text
  questions.forEach((question) => {
    columns.push(question.question);
  });
  data.push(columns);

  players = {};
  for (person of people) {
    player = [
      person.FirstName,
      person.LastName,
      person.Email,
      person.NickName,
      0, //Compute score from answered questions
      person.NumberAnswered,
      person.NumberCorrect
    ];
    //Add empty columns to be filled with scores
    player = player.concat(Array(questions.length).fill(0));
    players[person.PersonID] = player;
  }

  questionResponses.forEach((question) => {
    //Get offset to start of question list
    index = question.QuestionID + 7;
    person = question.PersonID;
    //Increment score
    players[person][4] += question.Score;
    players[person][index] = question.Score;
  });

  //Add players to data
  for (var key in players) {
    data.push(players[key]);
  }
  //Solution to download report taken from Stack Overflow: https://stackoverflow.com/a/29304414
  var csvContent = '';
  data.forEach(function(infoArray, index) {
    dataString = infoArray.join(';');
    csvContent += index < data.length ? dataString + '\n' : dataString;
  });

  var download = function(content, fileName, mimeType) {
    var a = document.createElement('a');
    mimeType = mimeType || 'application/octet-stream';

    if (navigator.msSaveBlob) { // IE10
      navigator.msSaveBlob(new Blob([content], {
        type: mimeType
      }), fileName);
    } else if (URL && 'download' in a) { //html5 A[download]
      a.href = URL.createObjectURL(new Blob([content], {
        type: mimeType
      }));
      a.setAttribute('download', fileName);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      location.href = 'data:application/octet-stream,' + encodeURIComponent(content); // only this mime type is supported
    }
  }

  download(csvContent, state.gameName + " Score Report.csv", 'text/csv;encoding:utf-8');
}
