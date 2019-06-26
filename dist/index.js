socket = io(`${window.location.hostname}:8090`);
var listeners = "click";

//Socket listeners
socket.on('roomListUpdate', roomListUpdate);
socket.on('sendAlert', sendAlert);
socket.on('reconnect', handleReconnect);

function handleReconnect() {
	$('#dialog').dialog('close');
}

//Socket functions
function roomListUpdate(people) {
  $('#playerList').empty();
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
