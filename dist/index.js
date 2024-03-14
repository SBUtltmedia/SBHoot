socket = io();
socket.on('connect', () => {
  socket.emit('new user', socket.id);
  //console.log(lockInfo)
 //lockInfo.callback(lockInfo.lockId)
})

socket.on('new connection', (state) => {
  // console.log("LOAD #2: RECEIEVE STATE");

});

var listeners = "click";
var state = {
  roomSize: 0,
  currentState: 'LOGIN'
};

//Socket listeners
socket.on('roomListUpdate', roomListUpdate);
socket.on('sendAlert', sendAlert);
socket.on('serverMismatch', serverMismatch);

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

//Moves user is something is funky
function serverMismatch(reason, resetState){
	changeState(resetState);
	sendAlert(reason);
}

function changeDisplay(show, noShow) {

 //$('body').children().hide();

  for (item of noShow) {
    $(item).hide();
  }
  for (item of show) {
    $(item).show();
  }
}

function standardizeRoomName(room){
  return room.replace(/ /g, "_").toUpperCase();
}

//Add player to DB if not exists
function logUser(email, firstName, lastName) {
  console.log(email, firstName, lastName)
  socket.emit('logUser', email, firstName, lastName);
}

function clearTextbox(tagId, defaultText){
  if($(tagId).val() == defaultText){
    $(tagId).val("");
  }
}

//Resets the default textbox value if nothing was entered
function resetDefaultTextbox(tagId, defaultText) {
  if($(tagId).val() == ""){
    $(tagId).val(defaultText);
  }
}

function displayPrevGames(games) {
  console.log(games)
  if (!games || games.length == 0) {
    $('#rejoin').html('No previous games');
  } else {
    $('#rejoin').empty();

    var prevGames = $('<select/>', {"name": "previousGames", "id":"previousGames"});
    var joinButton = $('<button/>', {"class": "rejoinGame", "type": "button", "html": "Join"});

    $('#rejoin').append(prevGames);
    $('#rejoin').append(joinButton);

    for (game of games) {
      var option = $('<option/>', {
        "value": game.Name,
        "class": "gameOption"}).text(game.Name);
      $('#previousGames').append(option);
    }
    $(".rejoinGame").prop('id', $("#previousGames").val());
    $("#previousGames").on("change", $(".rejoinGame").prop('id', $("#previousGames").val()));

    $(".rejoinGame").on(listeners, rejoinGame);
  }
}

//Handles all UI state changes in Oauth.js, instructor.js, & student.js
function changeState(newState, roomState) {
  console.log("entered here"+newState+roomState)
  if (newState != "LOGIN" && newState == state.currentState) {
    getRightButtons(roomState);
  } else {
    switch (newState) {
      //State where user is prompted to log in
      case "LOGIN":
        if (isInstructor()) {
          changeDisplay(["#authorize"], ['#signout', "#gameCreation", "#gameManagement"]);
        } else {
          changeDisplay(["#authorize"], ['#join', '#waitingRoom', '#stage', '#signout-button']);
        }
        break;
        //State after user has logged in and has not connected to a game
      case "MAIN_SCREEN":
        requestPrevGames();
        if (isInstructor()) {
          changeDisplay(['#signout', '#gameCreation', '#signout-button'], ["#authorize", '#gameManagement']);
        } else {
          console.log("cine gerere");
          //When a user logs in, add them to the game if possible
          changeDisplay(['#join', '#gameCreation', '#joinOptions', '#signout-button'], ["#authorize", '#waitingRoom', '#stage']);
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
        $('#kahootURL').val("");
        changeDisplay(['#gameManagement', '#startGame', '#downloadReport'], ['#gameCreation', '#questionFile', '#playerResults', '#stopGame']);
        getRightButtons(roomState);
        break;
      case "PLAYING":
        if (isInstructor()) {
          $('.gameName').text(state.gameName);
          changeDisplay(['#playerResults','#gameManagement', '#stopGame'], ['#gameCreation', '#questionFile', '#startGame', "#playerList"]);
        } else {
					changeDisplay(['#stage'], ["#authorize", '#waitingRoom', '#join']);
				  $('.answer').removeClass('rightAnswer wrongAnswer');
        }
        break;
    }
    state.currentState = newState;
  }
}

//This is a function in case things change / become more complicated
function loadingScreenState(state){
  if(state == 'on'){
    $(".loading-screen").show();
  } else {
    $(".loading-screen").hide();
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
