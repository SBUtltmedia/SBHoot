socket = io(`${window.location.hostname}:8090`);
var listeners = "click";
state = {
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
  for (item of show) {
    $(item).show();
  }
  for (item of noShow) {
    $(item).hide();
  }
}

//Add player to DB if not exists
function logUser(email, firstName, lastName) {
  socket.emit('logUser', email, firstName, lastName);
}

function changeState(state){
	switch(state){
		//State where user is prompted to log in
		case "LOGIN":
			if(isInstructor()){
				changeDisplay(["#authorize"], ['#signout']);
			} else {
				changeDisplay(["#authorize"], ['#join']);
			}
			break;
		//State after user has logged in and has not connected to a game
		case "MAIN_SCREEN":
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
			} else {
			}
			break;
		case "PLAYING":
			if(isInstructor()){
			} else {
			}
			break;
	}
}

function isInstructor(){
	return window.location.href.split("/")[3] == "instructor";
}
