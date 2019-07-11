socket = io(`${window.location.hostname}:8090`);
var listeners = "click";
var state = {
	roomSize: 0
};

//Socket listeners
socket.on('roomListUpdate', roomListUpdate);
socket.on('sendAlert', sendAlert);
//socket.on('reconnect', handleReconnect);

function closeAlert() {
	$('#dialog').dialog('close');
}

//Socket functions
function roomListUpdate(people) {
  $('#playerList').empty();
	state.roomSize = people.length;
  for (person of people) {
    $('#playerList').append('<li>' + person + '</li>');
  }
}

//Misc & Helper functions
function changeBodyBg() {
  document.body.style.background = random_bg_color();
}

function sendAlert(info) {
  $('#dialogText').text(info);
  $('#dialog').dialog();
}

function changeDisplay(show, noShow) {
	for (item of noShow) {
    $(item).hide();
  }
  for (item of show) {
    $(item).show();
  }
}

//Add player to DB if not exists
function logUser(email, firstName, lastName) {
  socket.emit('logUser', email, firstName, lastName);
}

function displayPrevGames(games) {
  if (games.length == 0){
    $('#rejoin ul').html('No previous games');
  }
  else {
    for (game of games) {
      var li=$('<li/>',{"html":game.Name});
      var button=$('<button/>',{"class":"rejoinGame","id":game.Name,"type":"button","html":"Join"});

      $('#previousGames').append(li.prepend(button));
    }
    $(".rejoinGame").on(listeners, rejoinGame);
  }
}

function changeState(newState){
	switch(newState){
		//State where user is prompted to log in
		case "LOGIN":
			if(isInstructor()){
				changeDisplay(["#authorize"], ['#signout', "#gameCreation", "#gameManagement"]);
			} else {
				changeDisplay(["#authorize"], ['#join', '#waitingRoom', '#stage']);
			}
			break;
		//State after user has logged in and has not connected to a game
		case "MAIN_SCREEN":
			requestPrevGames();
			if(isInstructor()){
				changeDisplay(['#signout', '#gameCreation'], ["#authorize"]);
			} else {
				changeDisplay(['#join', '#gameCreation'], ["#authorize"]);
				$("#roomId").val(roomURL);
			}
			break;
		//State where user has connected to a game
		case "WAITING_ROOM":
			$('.gameName').text(state.gameName);
			if(isInstructor()){
				changeDisplay(['#gameManagement'], ['#gameCreation']);
			} else {

			}
			break;
		case "WAITING_ROOM_FILE_READY":
			$('.gameName').text(state.gameName);
			changeDisplay(['#gameManagement', '#startGame', '#downloadReport'], ['#gameCreation', '#questionFile']);
			break;
		case "PLAYING":
			if(isInstructor()){
				changeDisplay(['#playerResults', '#stopGame'], ['#startGame', "#playerList"]);
			} else {

			}
			break;
	}
	state.state = newState;
}

function isInstructor(){
	return location.href.split("/")[3] == "instructor";
}
