var nickname;
var pickedAnswer;
var questionTime = 0;
var questionInterval = 0;

$(".answer").on(listeners, checkAnswer);
$("#joinGame").on(listeners, joinGame);
$("#leaveRoom").on(listeners, leaveGame);

socket.on('sendQuestion', sendQuestion);
socket.on('roomClosed', roomClosed);
socket.on('sendAnswer', sendAnswer);
socket.on('sendScoreBoard', sendScoreBoard);


socket.on('returnPreviousGamesStudent', displayPrevGames);

//Request previous games as soon as they're available
var x = setInterval(emailCheck ,25);
function emailCheck(){
  if(email){
    clearInterval(x);
    requestPrevGames();
  }
}

function requestPrevGames(){
  socket.emit('requestPreviousGamesStudent', email);
}

function displayPrevGames(games){
  if(games.length == 0)
    $('#rejoin').text('No previous games')
  else{
    $('#previousGames').empty();
    for(game of games){
      $('#previousGames').append('<li><button class="rejoinGame" id="' + game.Name + '" type="button">Join</button>\t'  + game.Name + '</li>');
    }
    $(".rejoinGame").on(listeners, rejoinGame);
  }
}

function joinGame() {
  //Add player to DB if not exists
  logUser(email, firstName, lastName);

  nickname = $('#nickname').val();
  socket.emit('joinGame', $('#roomId').val(), email, name, $('#nickname').val(), (isError) => {
    if (!isError) {
      changeDisplay(['#waitingRoom'], ['#signout']);
    } else {
      sendAlert('Error: Room is closed or does not exist');
    }
  });
}

function checkAnswer(evt) {
  if (pickedAnswer == -1) {
    pickedAnswer = evt.currentTarget.id.split('_')[1];
    socket.emit('checkAnswer', evt.currentTarget.id.split('_')[1], questionTime, email);
  }
}

function leaveGame() {
  socket.emit('leaveGame', email);
  changeDisplay(['#signout'], ['#waitingRoom']);
  requestPrevGames();
}

function rejoinGame(){
  socket.emit('rejoinGameStudent', this.id, email, name, $('#nickname').val(), (isError) => {
    if (!isError) {
      changeDisplay(['#waitingRoom'], ['#signout']);
    } else {
      sendAlert('Error: Room is closed or does not exist');
    }
  });
  changeDisplay(['#waitingRoom'], ['#signout']);
}

function sendQuestion(myJson) {
  clearInterval(questionInterval);
  questionTime = 0;
  questionInterval = setInterval(() => {
    questionTime++;
  }, 1000);
  pickedAnswer = -1;

  //changeBodyBg();
  changeDisplay(['#stage'], ['#waitingRoom']);
  $('.answer').removeClass('rightAnswer wrongAnswer');
  $("#question").text(myJson.question);
  for (var i = 0; i < myJson.answers.length; i++) {
    $("#answer_" + i).text(myJson.answers[i]);
  }
}

function roomClosed() {
  clearInterval(questionInterval);
  $('#playerList').empty();
  changeDisplay(['#signout'], ['#waitingRoom', '#stage']);
  sendAlert("Your game was terminated by the instructor");
}

function sendAnswer(answer, points) {
  $('#pointCounter').text(points);
  $('#answer_' + answer).addClass("rightAnswer");
  if (answer != pickedAnswer) {
    $('#answer_' + pickedAnswer).addClass("wrongAnswer");
  }
  //Prevent player from answering after receiving
  pickedAnswer = -2;
}

function sendScoreBoard(players) {
  //Bubblesort
  for (var i = 0; i < players.length - 1; i++) {
    for (var j = 0; j < players.length - i - 1; j++) {
      if (players[j][1] < players[j + 1][1]) {
        var temp = players[j];
        players[j] = players[j + 1];
        players[j + 1] = temp;
      }
    }
  }

  for (var i = 0; i < players.length && i < 5; i++) {
    $('#topRanked_' + i).text(players[i][0] + "\t\t" + players[i][1]);
  }
}
