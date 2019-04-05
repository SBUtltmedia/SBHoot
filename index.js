var socket = io();

socket.on('newQuestion', newQuestion);


function changeBodyBg(){
    document.body.style.background = random_bg_color();
}

function newQuestion(myJson) {
  $("#question").text(myJson.question);
  $("#answer_0").text(myJson.answers[0]);
  $("#answer_1").text(myJson.answers[1]);
  $("#answer_2").text(myJson.answers[2]);
  $("#answer_3").text(myJson.answers[3]);
}

$(function(){
  $(".answer").on("click", (evt)=>{
    socket.emit('checkAnswer', evt.currentTarget.id.split('_')[1]);
  });
});


function makeGame(){
  console.log($('#roomId').text());
}
