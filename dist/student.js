state.questionTime = 0;
state.questionInterval = 0;
state.playerScore = 0;

//Take a user out ofthe game when they close the screen,
//server will ignore if they are not in a game
window.onbeforeunload = () => {
  leaveGame();
  return null;
};

$(".answer").on(listeners, checkAnswer);
$("#joinGame").on(listeners, joinGame);
$("#leaveRoom").on(listeners, leaveGame);
$("#previousGames").on("show", requestPrevGames);
$("#roomId").on("focus", clearTextbox);
$("#nickname").on("focus", clearTextbox);
$("#roomId").on("focusout", ()=>{resetDefaultTextbox("#roomId", "yourClass", window.location.hash.replace('#', ''))});
$("#nickname").on("focusout", ()=>{resetDefaultTextbox("#nickname", "bill")});

socket.on('sendQuestion', sendQuestion);
socket.on('roomClosed', roomClosed);
socket.on('sendAnswer', sendAnswer);
socket.on('returnPreviousGamesStudent', displayPrevGames);
//socket.on('disconnect', handleDisconnect);

function handleDisconnect() {
  leaveRoom("Error: Disconnected from server");
}

function requestPrevGames() {
  $("#previousGames").empty();
  socket.emit('requestPreviousGamesStudent', email);
}

function joinGame() {
  if (socket.connected) {
    //Add player to DB if not exists
    logUser(email, firstName, lastName);

    socket.emit('joinGame', $('#roomId').val(), email, name, $('#nickname').val(), (returnVal) => {
      if (!returnVal.isError) {
        changeState(returnVal.state);
        window.location.hash = '#' + $('#roomId').val();
      } else {
        sendAlert(returnVal.error);
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
  changeState("MAIN_SCREEN");
}

function rejoinGame(room) {
  if (socket.connected) {
    if (typeof room != "string") {
      room = this.id;
    }
    socket.emit('joinGame', room, email, name, $('#nickname').val(), (returnVal) => {
      if (!returnVal.isError) {
        changeState(returnVal.state);
        window.location.hash = '#' + room;
      } else {
        requestPrevGames();
        sendAlert(returnVal.error);
      }
    });
  } else {
    sendAlert("Error: Not connected to server");
  }
}

function sendQuestion(myJson, timeGiven) {
  $(".answer").removeClass("rightAnswer wrongAnswer");
  state.questionTime = 0;
  $("#timer").html(timeGiven);
  state.questionInterval = setInterval(() => {
    state.questionTime++;
    time = timeGiven - state.questionTime;
    if (time >= 0)
      $("#timer").html(time);
  }, 1000);
  state.pickedAnswer = -1;

  $("#question").text(myJson.question);
  //Hide irrelevant answers
  for(var i = myJson.answers.length; i < 4; i++){
    $("#answer_" + i).hide();
  }
  for (var i = 0; i < myJson.answers.length; i++) {
    $("#answer_" + i).text(myJson.answers[i]);
    $("#answer_" + i).show();
  }
  resizeWindow();
  changeState("PLAYING");
}

function roomClosed() {
  leaveRoom("Your game was terminated by the instructor");
}

function sendAnswer(answer, points, players) {
  clearInterval(state.questionInterval);
  if (points > state.playerScore)
    state.playerScore = points;
  $('#pointCounter').text(state.playerScore);

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
  for (var i = 0; i < players.length; i++) {
    if (players[i][0] == state.nickname) {
      state.rank = i + 1;
      $("#rank").text(state.rank);
      break;
    }
  }
}

function leaveRoom(reason) {
  clearInterval(state.questionInterval);
  changeState("MAIN_SCREEN");
  sendAlert(reason);
}
