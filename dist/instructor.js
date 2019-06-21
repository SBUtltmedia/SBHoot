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
  socket.emit('rejoinGame', email, this.id);
  gameName = this.id;
  $('#gameName').text(gameName);
  changeDisplay(['#gameManagement', '#openGame'], ['#gameCreation', '#closeGame']);
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

function sendReport(r1, r2, roomList) {
  console.log(r1, r2, roomList);


  // //Final location for CSV Rows
  // data = [];
  //
  // //Column names
  // columns = [
  //   'First Name',
  //   'Last Name',
  //   'Email',
  //   'Nickname',
  //   'Score',
  //   'Number Answered',
  //   'Number Correct',
  //   'Desync'
  // ];
  // //Add question text
  // roomList.questions.forEach((question) => {
  //   columns.push(question.question);
  // });
  // data.push(columns);
  //
  // for (person of queryResult) {
  //   personTempData = roomList.players[person.Email];
  //   //TODO: Get player report
  //   player = [
  //     person.FirstName,
  //     person.LastName,
  //     person.Email,
  //     person.NickName,
  //     person.Score,
  //     person.NumberAnswered,
  //     person.NumberCorrect
  //   ];
  //
  //   //desync & fill in score vals
  //   if (personTempData) {
  //     player.push(person.Score == personTempData.score);
  //     personTempData.history.forEach((score) => {
  //       player.push(score);
  //     });
  //   } else {
  //     player.push(true);
  //     roomList.questions.forEach(() => {
  //       player.push(0);
  //     });
  //   }
  //   data.push(player);
  // }
  //
  // //Solution to download report taken from Stack Overflow: https://stackoverflow.com/a/29304414
  // var csvContent = '';
  // data.forEach(function(infoArray, index) {
  //   dataString = infoArray.join(';');
  //   csvContent += index < data.length ? dataString + '\n' : dataString;
  // });
  //
  // var download = function(content, fileName, mimeType) {
  //   var a = document.createElement('a');
  //   mimeType = mimeType || 'application/octet-stream';
  //
  //   if (navigator.msSaveBlob) { // IE10
  //     navigator.msSaveBlob(new Blob([content], {
  //       type: mimeType
  //     }), fileName);
  //   } else if (URL && 'download' in a) { //html5 A[download]
  //     a.href = URL.createObjectURL(new Blob([content], {
  //       type: mimeType
  //     }));
  //     a.setAttribute('download', fileName);
  //     document.body.appendChild(a);
  //     a.click();
  //     document.body.removeChild(a);
  //   } else {
  //     location.href = 'data:application/octet-stream,' + encodeURIComponent(content); // only this mime type is supported
  //   }
  // }
  //
  // download(csvContent, gameName + " Score Report.csv", 'text/csv;encoding:utf-8');
}
