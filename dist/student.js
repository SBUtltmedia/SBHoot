state.questionTime = 0;
state.questionInterval = 0;

$(".answer").on(listeners, checkAnswer);
$("#joinGame").on(listeners, joinGame);
$("#leaveRoom").on(listeners, leaveGame);
$("#previousGames").on("show", requestPrevGames);

socket.on('sendQuestion', sendQuestion);
socket.on('roomClosed', roomClosed);
socket.on('sendAnswer', sendAnswer);
socket.on('returnPreviousGamesStudent', displayPrevGames);
//socket.on('disconnect', handleDisconnect);

function handleDisconnect() {
  leaveRoom("Error: Disconnected from server");
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
  $("#previousGames").empty();
  socket.emit('requestPreviousGamesStudent', email);
}

function displayPrevGames(games) {
  $('#previousGames').empty();
  if (games.length == 0)
    $('#rejoin').text('No previous games')
  else {
    for (game of games) {
      $('#previousGames').append('<li><button class="rejoinGame" id="' + game.Name + '" type="button">Join</button>\t' + game.Name + '</li>');
    }
    $(".rejoinGame").on(listeners, rejoinGame);
  }
}

function joinGame() {
  if (socket.connected) {
    //Add player to DB if not exists
    logUser(email, firstName, lastName);

    state.nickname = $('#nickname').val();
    socket.emit('joinGame', $('#roomId').val(), email, name, $('#nickname').val(), (isError, reason) => {
      if (!isError) {
        changeDisplay(['#waitingRoom'], ['#join']);
      } else {
        sendAlert(reason);
      }
    });
  } else {
    sendAlert("Error: Not connected to server");
  }
}

function checkAnswer(evt) {
  if (state.pickedAnswer == -1) {
    state.pickedAnswer = evt.currentTarget.id.split('_')[1];
    socket.emit('checkAnswer', evt.currentTarget.id.split('_')[1], state.questionTime, email);
  }
}

function leaveGame() {
  socket.emit('leaveGame', email);
  changeDisplay(['#join'], ['#waitingRoom']);
  requestPrevGames();
}

function rejoinGame() {
  if (socket.connected) {
    socket.emit('rejoinGameStudent', this.id, email, name, $('#nickname').val(), (isError) => {
      if (!isError) {
        changeDisplay(['#waitingRoom'], ['#join']);
        state.nickname = $('#nickname').val();
      } else {
        sendAlert('Error: Room is closed or does not exist');
      }
    });
    changeDisplay(['#waitingRoom'], ['#join']);
  } else {
    sendAlert("Error: Not connected to server");
  }
}

function sendQuestion(myJson) {
  clearInterval(state.questionInterval);
  state.questionTime = 0;
  state.questionInterval = setInterval(() => {
    state.questionTime++;
  }, 1000);
  state.pickedAnswer = -1;

  //changeBodyBg();
  changeDisplay(['#stage'], ['#waitingRoom']);
  $('.answer').removeClass('rightAnswer wrongAnswer');
  $("#question").text(myJson.question);
  for (var i = 0; i < myJson.answers.length; i++) {
    $("#answer_" + i).text(myJson.answers[i]);
  }
  resizeWindow();
}

function roomClosed() {
  leaveRoom("Your game was terminated by the instructor");
}

function sendAnswer(answer, points, players) {
  $('#pointCounter').text(points);
  $('#answer_' + answer).addClass("rightAnswer");
  if (answer != state.pickedAnswer) {
    $('#answer_' + state.pickedAnswer).addClass("wrongAnswer");
  }
  //Prevent player from answering after receiving
  state.pickedAnswer = -2;

  //Bubblesort player standings
  for (var i = 0; i < players.length - 1; i++) {
    for (var j = 0; j < players.length - i - 1; j++) {
      if (players[j][1] < players[j + 1][1]) {
        var temp = players[j];
        players[j] = players[j + 1];
        players[j + 1] = temp;
      }
    }
  }

  //Get player rank
  for (var i = 0; i < players.length; i++){
    console.log(players[i], state.nickname)
    if(players[i][0] == state.nickname){
      console.log("Found!")
      state.rank = i + 1;
      $("#rank").text(state.rank);
      break;
    }
  }

  //Show top 5
  for (var i = 0; i < players.length && i < 5; i++) {
    $('#topRanked_' + i).text(players[i][0] + "\t\t" + players[i][1]);
  }
}

function leaveRoom(reason) {
  clearInterval(state.questionInterval);
  $('#playerList').empty();
  changeDisplay(['#join'], ['#waitingRoom', '#stage']);
  sendAlert(reason);
  requestPrevGames();
}
