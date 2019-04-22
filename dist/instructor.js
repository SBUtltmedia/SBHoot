$("#makeGame").on(listeners, makeGame);
$("#openGame").on(listeners, openGame);
$("#closeGame").on(listeners, closeGame);
$("#deleteGame").on(listeners, deleteGame);
$("#startGame").on(listeners, startGame);

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
