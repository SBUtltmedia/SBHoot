$("#makeGame").on(listeners, makeGame);
$("#openGame").on(listeners, openGame);
$("#closeGame").on(listeners, closeGame);
$("#deleteGame").on(listeners, deleteGame);
$("#startGame").on(listeners, startGame);

socket.on('playerResults', playerResults);

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
    changeDisplay(['#playerResults'], ['#startGame', "#playerList"]);
  } else {
    sendAlert("Error: cannot start a game with no players");
  }
}

function playerResults(players){
  //First run
  if($('#playerResults tr').length == 0){
    $('#playerResults').append('<tr><th>Name</th><th>Nickname</th><th>Score</th></tr>');
    for(player of players){
      tr = '<tr id="' + player[3] + '"><td>' + player[0] + '</td><td>' + player[1] + '</td><td id="score">' + player[2] + '</td></tr>';
      $('#playerResults').append(tr);
    }
  }
  //Add info
  else {
    console.log(players)
    for(player of players){
      //$('table#playerResults tr[id="' + player[3] + ']"').find("#score").text(player[2]);

      console.log($("#playerResults").find("#" + player[3]).find('#score'))
    }
  }


}
