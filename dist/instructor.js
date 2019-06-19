$("#makeGame").on(listeners, makeGame);
$("#openGame").on(listeners, openGame);
$("#closeGame").on(listeners, closeGame);
$("#deleteGame").on(listeners, deleteGame);
$("#startGame").on(listeners, startGame);
$("#downloadReport").on(listeners, downloadReport);

var siofu = new SocketIOFileUpload(socket);

siofu.listenOnDrop(document.getElementById("file_drop"));



// Set meta name so the file can be renamed later
siofu.addEventListener("start", (event) => {
  event.file.meta.name = $('#gameName').text();
});

// Do something when a file is uploaded:
siofu.addEventListener("complete", (event) => {
  changeDisplay(['#startGame'], []);
});

socket.on('playerResults', playerResults);
socket.on('returnPreviousGames', displayPrevGames);


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
  $('#gameName').text(this.id);
  changeDisplay(['#gameManagement', '#openGame'], ['#gameCreation', '#closeGame']);
}



function makeGame() {
  logUser(email, firstName, lastName);
  socket.emit('makeGame', $('#roomId').val(), email, (error) => {
    if (!error) {
      $('#gameName').text($('#roomId').val());
      changeDisplay(['#gameManagement'], ['#gameCreation']);
    } else {
      sendAlert('Error: Game already exists!');
    }
  });
}

function openGame() {
  socket.emit('changeGameState', $('#gameName').text(), 'open');
  changeDisplay(['#closeGame', '#startGame'], ['#openGame']);
}

function closeGame() {
  socket.emit('changeGameState', $('#gameName').text(), 'closed');
  changeDisplay(['#openGame'], ['#closeGame']);
}

function deleteGame() {
  if (confirm('Are you sure you want to delete ' + $('#gameName').text() + '?')) {
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

function downloadReport(){
  socket.emit('downloadReport');
}

function getSelector(input) {
  return input.replace(/[@.]/gi, '_');
}
