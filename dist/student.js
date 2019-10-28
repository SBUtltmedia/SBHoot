state.questionTime = 0;
state.questionInterval = 0;
state.playerScore = 0;

//Take a user out ofthe game when they close the screen,
//server will ignore if they are not in a game
window.onbeforeunload = () => {
  leaveGame();
  return null;
};

$(".answer").on(listeners, checkAnswer);
$("#joinGame").on(listeners, joinGame);
$("#leaveRoom").on(listeners, leaveGame);
$("#previousGames").on("show", requestPrevGames);
$("#roomId").on("focus", ()=>{
  hash = window.location.hash.replace('#', '');
  clearTextbox("#roomId", hash ? hash : "yourClass")});
$("#nickname").on("focus", ()=>{clearTextbox("#nickname", "bill")});
$("#roomId").on("focusout", ()=>{
  hash = window.location.hash.replace('#', '');
  resetDefaultTextbox("#roomId", hash ? hash : "yourClass");
});
$("#nickname").on("focusout", ()=>{resetDefaultTextbox("#nickname", "bill")});

socket.on('sendQuestion', sendQuestion);
socket.on('roomClosed', roomClosed);
socket.on('sendAnswer', sendAnswer);
socket.on('returnPreviousGamesStudent', displayPrevGames);

function requestPrevGames() {
  $("#previousGames").empty();
  socket.emit('requestPreviousGamesStudent', email);
}

function joinGame() {
  if (socket.connected) {
    //Add player to DB if not exists
    logUser(email, firstName, lastName);

    room = standardizeRoomName($('#roomId').val());

    socket.emit('joinGame', room, email, name, $('#nickname').val(), (returnVal) => {
      if (!returnVal.isError) {
        changeState(returnVal.state);
        window.location.hash = '#' + room;
      } else {
        sendAlert(returnVal.error);
      }
    });
  } else {
    sendAlert("Error: Not connected to server");
  }
}

function checkAnswer(evt)
{

  if (state.pickedAnswer == -1) {
    state.pickedAnswer = evt.currentTarget.id.split('_')[1];
      //$('#answer_' + state.pickedAnswer).addClass("spin");
    socket.emit('checkAnswer', evt.currentTarget.id.split('_')[1], state.questionTime, email);
  }
}

function leaveGame() {
  socket.emit('leaveGame', email);
  changeState("MAIN_SCREEN");
}

function addAnimation(el,animClass,afterClass=undefined){



$(el).addClass(animClass)

$(el).on("animationend",
function() {
  console.log("removing", animClass)
    $(el).removeClass(animClass);

    if (afterClass) {

    el.addClass(afterClass)

    }
})
}


function rejoinGame(room) {
  if (socket.connected) {
    if (typeof room != "string") {
      room = this.id;
    }

    room = standardizeRoomName(room);

    socket.emit('joinGame', room, email, name, $('#nickname').val(), (returnVal) => {
      if (!returnVal.isError) {
        changeState(returnVal.state);
        window.location.hash = '#' + room;
        if(returnVal.state == 'PLAYING'){
          loadingScreenState('on');
        }
      } else {
        requestPrevGames();
        sendAlert(returnVal.error);
      }
    });
  } else {
    sendAlert("Error: Not connected to server");
  }
}

function sendQuestion(myJson, timeGiven) {
  $(".answer").removeClass("rightAnswer wrongAnswer spin");
$('.answer').each(function(el)
{
  console.log(el)
addAnimation($(this),"answerLoad","answerRock");


}



)



  clearInterval(state.questionInterval);

  state.questionTime = 0;
  $("#timer").html(timeGiven);
  state.questionInterval = setInterval(() => {
    state.questionTime++;
    time = timeGiven - state.questionTime;
    if (time >= 0)
      $("#timer").html(time);
  }, 1000);
  state.pickedAnswer = -1;

  $("#question").html(myJson.question);
  //Hide irrelevant answers
  // for(var i = myJson.answers.length; i < 4; i++){
  //   $("#answer_" + i).hide();
  // }
  for (var i = 0; i < myJson.answers.length; i++) {
    $("#answer_" + i).html(myJson.answers[i]);
    $("#answer_" + i).show();


  }

//   $('.answer').on("animationend", function(){
//     $('.answer').removeClass("spin")
//     if($(this).hasClass("answerLoad")){
//     $(this).removeClass("answerLoad")
//     $(this).addClass("answerRock")
// }
  //});
  changeState("PLAYING");
  setQuestionTextSize();
  // resizeWindow();
  loadingScreenState('off');
}

function roomClosed() {
  leaveRoom("Your game was terminated by the instructor");
}

function sendAnswer(answer, points, players) {
    $('.answer').removeClass("answerRock");
  clearInterval(state.questionInterval);
  if (points > state.playerScore)
    state.playerScore = points;
  $('#pointCounter').text(state.playerScore);
  var delayInMilliseconds = 1000;


  if (answer != state.pickedAnswer) {
    addAnimation($('#answer_' + state.pickedAnswer),"spinWrong");
    $('#answer_' + state.pickedAnswer).addClass("wrongAnswer");
  //   setTimeout(function(){
  // $('#answer_' + answer).addClass("rightAnswer");
  //   },1500);

  }else{
    $('.answer').removeClass("spinWrong");
      addAnimation($('#answer_' + state.pickedAnswer),"spinRight");
  $('#answer_' + answer).addClass("rightAnswer");
  }

  // setTimeout(function(){
  //   $('.answer').removeClass("spinRight");
  //   $('.answer').removeClass("spinWrong");
  // },1500);



  //Prevent player from answering after receiving
  state.pickedAnswer = -2;

  //Bubblesort player standings
  for (var i = 0; i < players.length - 1; i++) {
    for (var j = 0; j < players.length - i - 1; j++) {
      if (players[j][1] < players[j + 1][1]) {
        var temp = players[j];
        players[j] = players[j + 1];
        players[j + 1] = temp;
      }
    }
  }

  //Get player rank
  for (var i = 0; i < players.length; i++) {
    if (players[i][0] == state.nickname) {
      state.rank = i + 1;
      $("#rank").text(state.rank);
      break;
    }
  }
}

function leaveRoom(reason) {
  clearInterval(state.questionInterval);
  changeState("MAIN_SCREEN");
  sendAlert(reason);
}
