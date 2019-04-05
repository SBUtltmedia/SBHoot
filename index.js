var socket = io();
// socket.emit('go',foo)
socket.on('newQuestion', newQuestion);

socket.on('newToRoom', (person) => {
  $('#playerList ul').append('<li>' + person + '</li>')
});
// function foo(data){
//   alert(data)
// }

function changeBodyBg() {
  document.body.style.background = random_bg_color();
}

function newQuestion(myJson) {
  $("#question").text(myJson.question);
  $("#answer_0").text(myJson.answers[0]);
  $("#answer_1").text(myJson.answers[1]);
  $("#answer_2").text(myJson.answers[2]);
  $("#answer_3").text(myJson.answers[3]);
}

$(function() {
  $(".answer").on("click", (evt) => {
    socket.emit('checkAnswer', evt.currentTarget.id.split('_')[1]);
  });
  $("#joinGame").on("click", joinGame);
  $("#makeGame").on("click", makeGame);
});

function makeGame() {
  console.log($('#roomId').text());
  socket.emit('makeGame', $('#roomId').val(), (error)=>{
    if (!error) {
        $('#gameManagement').css('display', 'block');
        $('#gameName').text($('#roomId').text());
      } else {
        $('#makeGameError').text('Error: Game already exists!');
      }
  });
}

function joinGame() {
  socket.emit('joinGame', $('#roomId').val(), $('#nickname').val(), (isError) => {
    if (!isError) {
      $('#signout').css('display', 'none');
      $('#waitingRoom').css('display', 'block');
    } else {
      $('#joinGameError').text('\tError: Room is full or does not exist');
    }
  });
}
