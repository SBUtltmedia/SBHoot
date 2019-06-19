socket = io(`${window.location.hostname}:8090`);
var listeners = "click";

//Socket listeners
socket.on('roomListUpdate', roomListUpdate);
socket.on('sendAlert', sendAlert);

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
  for (var i = 0; i < show.length; i++) {
    $(show[i]).css('display', 'block');
  }
  for (var i = 0; i < noShow.length; i++) {
    $(noShow[i]).css('display', 'none');
  }
}

//Add player to DB if not exists
function logUser(email, firstName, lastName) {
  socket.emit('logUser', email, firstName, lastName);
}
