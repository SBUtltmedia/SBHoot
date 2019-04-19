var socket = io(`${window.location.hostname}:8090`);
var nickname;
var pickedAnswer;
var questionTime = 0;
var questionInterval = 0;

//Load button functions w/ page
$(function() {
  var listeners = "click";
  $(".answer").on(listeners, checkAnswer);
  $("#joinGame").on(listeners, joinGame);
  $("#makeGame").on(listeners, makeGame);
  $("#leaveRoom").on(listeners, leaveRoom);
  $("#openGame").on(listeners, openGame);
  $("#closeGame").on(listeners, closeGame);
  $("#deleteGame").on(listeners, deleteGame);
  $("#startGame").on(listeners, startGame);
});


//Socket listeners
socket.on('roomListUpdate', roomListUpdate);

socket.on('sendQuestion', sendQuestion);

socket.on('roomClosed', roomClosed);

socket.on('sendAnswer', sendAnswer);

socket.on('sendScoreBoard', sendScoreBoard);

//Button functions
function checkAnswer(evt) {
  if(pickedAnswer == -1){
    pickedAnswer = evt.currentTarget.id.split('_')[1];
    socket.emit('checkAnswer', evt.currentTarget.id.split('_')[1], questionTime, email);
  }
}

function leaveRoom() {
  socket.emit('leaveGame', email);
  changeDisplay(['#signout'], ['#waitingRoom']);
}

function joinGame() {
  nickname = $('#nickname').val();
  socket.emit('joinGame', $('#roomId').val(), email, name, $('#nickname').val(), (isError) => {
    if (!isError) {
      changeDisplay(['#waitingRoom'], ['#signout']);
    } else {
      sendAlert('Error: Room is closed or does not exist');
    }
  });
}

function makeGame() {
  socket.emit('makeGame', $('#roomId').val(), email, (error)=>{
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
  if(confirm('Are you sure you want to delete ' + $('#gameName').text() + '?')){
    socket.emit('deleteGame');
    $('#playerList').empty();
    changeDisplay(['#gameCreation'], ['#gameManagement']);
  }
}

function startGame() {
  //Must have at least 1 player to start
  if($('ul#playerList li').length > 0){
    socket.emit('startGame');
    $('#startGame').css('display', 'none');
  } else {
    sendAlert("Error: cannot start a game with no players");
  }
}

//Socket functions
function roomListUpdate(people) {
  $('#playerList').empty();
  for(person of people){
    $('#playerList').append('<li>' + person + '</li>');
  }
}

//Client Socket
function sendQuestion(myJson) {
  clearInterval(questionInterval);
  questionTime = 0;
  questionInterval = setInterval(()=>{questionTime++;}, 1000);
  pickedAnswer = -1;

  //changeBodyBg();
  changeDisplay(['#stage'], ['#waitingRoom']);
  $('.answer').removeClass('rightAnswer wrongAnswer');
  $("#question").text(myJson.question);
  for (var i = 0; i < myJson.answers.length; i++) {
    $("#answer_"+i).text(myJson.answers[i]);
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
  if(answer != pickedAnswer){
    $('#answer_' + pickedAnswer).addClass("wrongAnswer");
  }
  //Prevent player from answering after receiving
  pickedAnswer = -2;
}

function sendScoreBoard(players){
  //Bubblesort
  for(var i = 0; i < players.length-1; i++) {
    for (var j = 0; j < players.length-i-1; j++) {
      if(players[j][1] < players[j+1][1]){
        var temp = players[j];
        players[j] = players[j+1];
        players[j+1] = temp;
      }
    }
  }

  for (var i = 0; i < players.length && i < 5; i++) {
    $('#topRanked_'+i).text(players[i][0] + "\t\t" + players[i][1]);
  }
}

//Misc & Helper functions
function changeBodyBg() {
  document.body.style.background = random_bg_color();
}

function sendAlert(info){
  $('#dialogText').text(info);
  $('#dialog').dialog();
}

function changeDisplay(show, noShow){
  for (var i = 0; i < show.length; i++) {
    $(show[i]).css('display', 'block');
  }
  for (var i = 0; i < noShow.length; i++) {
    $(noShow[i]).css('display', 'none');
  }
}
