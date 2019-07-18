socket = io(`${window.location.hostname}:8090`);
var listeners = "click";
var state = {
  roomSize: 0,
  currentState: 'LOGIN'
};

//Socket listeners
socket.on('roomListUpdate', roomListUpdate);
socket.on('sendAlert', sendAlert);
socket.on('serverMismatch', serverMismatch);
//socket.on('reconnect', handleReconnect);

function closeAlert() {
  $('#dialog').dialog('close');
}

//Socket functions
function roomListUpdate(people) {
  console.log(people);
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

//Moves user is something is funky
function serverMismatch(reason, resetState){
	changeState(resetState);
	sendAlert(reason);
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
  if (!games || games.length == 0) {
    $('#rejoin ul').html('No previous games');
  } else {
    for (game of games) {
      var li = $('<li/>', {
        "html": game.Name
      });
      var button = $('<button/>', {
        "class": "rejoinGame",
        "id": game.Name,
        "type": "button",
        "html": "Join"
      });

      $('#previousGames').append(li.prepend(button));
    }
    $(".rejoinGame").on(listeners, rejoinGame);
  }
}

//Handles all UI state changes in Oauth.js, instructor.js, & student.js
function changeState(newState, roomState) {
  if (newState != "LOGIN" && newState == state.currentState) {
    getRightButtons(roomState);
  } else {
    switch (newState) {
      //State where user is prompted to log in
      case "LOGIN":
        if (isInstructor()) {
          changeDisplay(["#authorize"], ['#signout', "#gameCreation", "#gameManagement"]);
        } else {
          changeDisplay(["#authorize"], ['#join', '#waitingRoom', '#stage']);
        }
        break;
        //State after user has logged in and has not connected to a game
      case "MAIN_SCREEN":
        requestPrevGames();
        if (isInstructor()) {
          changeDisplay(['#signout', '#gameCreation'], ["#authorize", '#gameManagement']);
        } else {
          //When a user logs in, add them to the game if possible
          changeDisplay(['#join', '#gameCreation'], ["#authorize", '#waitingRoom', '#stage']);
          $("#roomId").val(roomURL);
        }
        break;
        //State where user has connected to a game
      case "WAITING_ROOM":
				$('#playerList').empty();
				state.roomSize = 0;

        if (isInstructor()) {
					$('.gameName').text(state.gameName);
          changeDisplay(['#gameManagement', '#questionFile'], ['#gameCreation', '#playerResults']);
          getRightButtons(roomState);
        } else {
					state.nickname = $('#nickname').val();
	        state.gameName = $('#roomId').val();
					$('.gameName').text(state.gameName);
					changeDisplay(['#waitingRoom'], ['#join']);
        }
        break;
      case "WAITING_ROOM_FILE_READY":
        $('.gameName').text(state.gameName);
        changeDisplay(['#gameManagement', '#startGame', '#downloadReport'], ['#gameCreation', '#questionFile', '#playerResults', '#stopGame']);
        getRightButtons(roomState);
        break;
      case "PLAYING":
        if (isInstructor()) {
          changeDisplay(['#playerResults', '#stopGame'], ['#startGame', "#playerList"]);
        } else {
					changeDisplay(['#stage'], ['#waitingRoom']);
				  $('.answer').removeClass('rightAnswer wrongAnswer');
        }
        break;
    }
    state.currentState = newState;
  }
}

function isInstructor() {
  items = location.href.split("/");
  return items[items.length-1].split("#")[0] == "instructor";
}

function getRightButtons(roomState) {
  //Make sure the right one is displayed
  if (roomState == 'open') {
    changeDisplay(["#closeGame"], ["#openGame"]);
  } else if (roomState == 'closed') {
    changeDisplay(["#openGame"], ["#closeGame"]);
  }
}
