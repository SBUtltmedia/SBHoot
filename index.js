var socket = io(`${window.location.hostname}:8090`);
var nickname;
socket.on('sendQuestion', sendQuestion);


$(function() {
  var listeners = "click";
  $(".answer").on(listeners, (evt) => {
    socket.emit('checkAnswer', evt.currentTarget.id.split('_')[1]);
  });
  $("#joinGame").on(listeners, joinGame);
  $("#makeGame").on(listeners, makeGame);
  $("#leaveRoom").on(listeners, leaveRoom);
  $("#openGame").on(listeners, openGame);
  $("#closeGame").on(listeners, closeGame);
  $("#deleteGame").on(listeners, deleteGame);
  $("#startGame").on(listeners, startGame);
});

socket.on('roomListUpdate', (people) => {
  $('#playerList').empty();
  for(person of people){
    $('#playerList').append('<li>' + person + '</li>');
  }
});

socket.on('roomClosed', ()=> {
  socket.off(socket.room);
  $('#playerList').empty();
  $('#signout').css('display', 'block');
  $('#waitingRoom').css('display', 'none');
})

function changeBodyBg() {
  document.body.style.background = random_bg_color();
}

function sendQuestion(myJson) {
  $('#waitingRoom').css('display', 'none');
  $('#stage').css('display', 'block');
  $("#question").text(myJson.question);
  $("#answer_0").text(myJson.answers[0]);
  $("#answer_1").text(myJson.answers[1]);
  $("#answer_2").text(myJson.answers[2]);
  $("#answer_3").text(myJson.answers[3]);
}



function leaveRoom() {
  socket.emit('leaveGame', nickname);
  $('#signout').css('display', 'block');
  $('#waitingRoom').css('display', 'none');
}

function makeGame() {
  socket.emit('makeGame', $('#roomId').val(), email, (error)=>{
    if (!error) {
        $('#gameManagement').css('display', 'block');
        $('#gameName').text($('#roomId').val());
        $('#gameCreation').css('display', 'none');
      } else {
        $('#GameError').text('Error: Game already exists!');
      }
  });
}

function joinGame() {
  nickname = $('#nickname').val();
  socket.emit('joinGame', $('#roomId').val(), $('#nickname').val(), (isError) => {
    if (!isError) {
      $('#signout').css('display', 'none');
      $('#waitingRoom').css('display', 'block');
    } else {
      $('#joinGameError').text('\tError: Room is closed or does not exist');
    }
  });
}

function openGame() {
  socket.emit('changeGameState', $('#gameName').text(), 'open');
  $('#openGame').css('display', 'none');
  $('#closeGame').css('display', 'block');
  $('#startGame').css('display', 'block');
}

function closeGame() {
  socket.emit('changeGameState', $('#gameName').text(), 'closed');
  $('#openGame').css('display', 'block');
  $('#closeGame').css('display', 'none');
  $('#startGame').css('display', 'none');
}

function deleteGame() {
  if(confirm('Are you sure you want to delete ' + $('#gameName').text() + '?')){
    socket.emit('deleteGame', $('#gameName').text());
    $('#gameManagement').css('display', 'none');
    $('#gameCreation').css('display', 'block');
  }
}

function startGame() {
  socket.emit('startGame', $('#gameName').text());
}
