$("#makeGame").on(listeners, makeGame);
$("#openGame").on(listeners, openGame);
$("#closeGame").on(listeners, closeGame);
$("#deleteGame").on(listeners, deleteGame);
$("#startGame").on(listeners, startGame);
$("#downloadReport").on(listeners, downloadReport);

// Allows a user to upload a file
var siofu = new SocketIOFileUpload(socket);
siofu.listenOnDrop(document.getElementById("file_drop"));

// Do something when a file is uploaded:
siofu.addEventListener("complete", (event) => {
  changeDisplay(['#startGame', '#downloadReport'], ['#file_drop']);
});

socket.on('playerResults', playerResults);
socket.on('returnPreviousGames', displayPrevGames);
socket.on('sendReport', sendReport);


var gameName;

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
  gameName = this.id;
  $('#gameName').text(gameName);
  changeDisplay(['#gameManagement'], ['#gameCreation']);

  //See whether or not we need to display file drop
  callback = (fileExists) => {
    if(fileExists){
      changeDisplay(['#startGame'], ['#file_drop']);
    }
  };
  socket.emit('rejoinGame', email, this.id, callback);
}



function makeGame() {
  logUser(email, firstName, lastName);
  socket.emit('makeGame', $('#roomId').val(), email, (error) => {
    if (!error) {
      gameName = $('#roomId').val();
      $('#gameName').text(gameName);
      changeDisplay(['#gameManagement'], ['#gameCreation']);
    } else {
      sendAlert('Error: Game already exists!');
    }
  });
}

function openGame() {
  socket.emit('changeGameState', gameName, 'open');
  changeDisplay(['#closeGame', '#startGame'], ['#openGame']);
}

function closeGame() {
  socket.emit('changeGameState', gameName, 'closed');
  changeDisplay(['#openGame'], ['#closeGame']);
}

function deleteGame() {
  if (confirm('Are you sure you want to delete ' + gameName + '?')) {
    socket.emit('deleteGame');
    $('#playerList').empty();
    changeDisplay(['#gameCreation'], ['#gameManagement']);
    requestPrevGames(email);
  }
}

function startGame() {
  //Must have at least 1 player to start
  if ($('ul#playerList li').length > 0) {
    socket.emit('startGame');
    $('#startGame').css('display', 'none');
    changeDisplay(['#playerResults'], ['#startGame', "#playerList"]);
  } else {
    sendAlert("Error: cannot start a game with no players");
  }
}

function playerResults(players) {
  //First run
  if ($('#playerResults tr').length == 0) {
    $('#playerResults').append('<tr><th>Name</th><th>Nickname</th><th>Score</th></tr>');
    for (player of players) {
      tr = '<tr id="' + getSelector(player[3]) + '"><td>' + player[0] + '</td><td>' + player[1] + '</td><td class="score">' + player[2] + '</td></tr>';
      $('#playerResults').append(tr);
    }
  }
  //Add info
  else {
    for (player of players) {
      $("#" + getSelector(player[3]) + ' td.score').text(player[2]);
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
  for(person of people){
    player = [
        person.FirstName,
        person.LastName,
        person.Email,
        person.NickName,
        0,  //Compute score from answered questions
        person.NumberAnswered,
        person.NumberCorrect
      ];
      //Add empty columns to be filled with scores
      player = player.concat(Array(questions.length).fill(0));
      players[person.PersonID] = player;
  }

  questionResponses.forEach((question) =>{
    //Get offset to start of question list
    index = question.QuestionID + 7;
    person = question.PersonID;
    //Increment score
    players[person][4] += question.Score;
    players[person][index] = question.Score;
  });

  //Add players to data
  for(var key in players){
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

  download(csvContent, gameName + " Score Report.csv", 'text/csv;encoding:utf-8');
}
