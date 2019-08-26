$("#makeGame").on(listeners, makeGame);
$("#startGame").on(listeners, startGame);
$("#stopGame").on(listeners, stopGame);
$("#useDefaultQuestions").on(listeners, useDefaultQuestions);
$("#uploadKahoot").on(listeners, uploadFromKahoot);
$("#roomId").on("focus", ()=>{
  hash = window.location.hash.replace('#', '');
  clearTextbox("#roomId", hash ? hash : "yourClass")});
$("#roomId").on("focusout", ()=>{resetDefaultTextbox("#roomId", "yourClass")});

$("#options").on("change", routeOptions);

function routeOptions(){
  if($(this).val() != ""){
    (new Function($(this).val() + "()"))();
    $(this).val("");
  }
}

// Allows a user to upload a file
var siofu = new SocketIOFileUpload(socket);
siofu.listenOnDrop(document.getElementById("file_drop"));

// Do something when a file is uploaded:
socket.on('uploadSuccessful', ()=>{changeState("WAITING_ROOM_FILE_READY");});
socket.on('uploadFailed', sendAlert);

function useDefaultQuestions(){
  socket.emit('useDefaultQuestions', ()=>{
    changeState("WAITING_ROOM_FILE_READY");
  });
}

function uploadFromKahoot() {
  url = $("#kahootURL")[0].value.split("/");
  id = url[url.length - 1];

  if(id == ""){
    sendAlert("Error: Invalid URL Entered");
    return;
  }

  sendAlert("Uploading file from Kahoot...");
  try {
    $.get(`http://proxy.fenetik.com?url=${id}`,(data)=>{
      if(data == ""){
        sendAlert("Error: Invalid URL Entered");
        return;
      }
      //Parse on client side to reduce server load
      var questions = JSON.parse(data).questions;
      var parsedQuestions = [];
      for(var i = 0; i < questions.length; i++){
        question = questions[i];
        parsedQuestion = {
          question: question.question,
          answers: [],
          time: question.time / 1000
        };
        for(var j = 0; j < question.choices.length; j++){
          choice = question.choices[j]
          if(choice.correct){
            if(!parsedQuestion.correct){
              parsedQuestion.correct = j;
            } else {
              i = questions.length;
              break;
              sendAlert("Error: SBHoot only accepts questions with one correct answer");
            }
          }
          parsedQuestion.answers.push(choice.answer);
        }
        parsedQuestions.push(parsedQuestion);
      }
      socket.emit('kahootUpload', parsedQuestions, ()=>{
        closeAlert();
        changeState("WAITING_ROOM_FILE_READY");
      })
    });
  } catch(err) {
    sendAlert("Error: invalid URL");
  }
}

socket.on('playerResults', playerResults);
socket.on('returnPreviousGames', displayPrevGames);
socket.on('sendReport', sendReport);

function requestPrevGames() {
  $('#previousGames').empty();
  socket.emit('requestPreviousGames', email);
}

function rejoinGame() {
  if (socket.connected) {
    state.gameName = this.id;

    callback = (input, roomState) => {
      //Jump right to playing if the game was left in motion
      if(input == "running"){
        changeState("PLAYING");
      }
      //See whether or not we need to display file drop
      else if (input == "file drop") {
        changeState("WAITING_ROOM_FILE_READY", roomState);
      } else {
        changeState("WAITING_ROOM", roomState);
      }
    }

    socket.emit('rejoinGame', email, this.id, callback);
  } else {
    sendAlert("Error: Not connected to server");
  }
}

function makeGame() {
  if (socket.connected) {
    logUser(email, firstName, lastName);

    room = $('#roomId').val().replace(/ /g, "_").toUpperCase();

    socket.emit('makeGame', room, email, (error) => {
      if (!error) {
        state.gameName = room;
        changeState("WAITING_ROOM");
      } else {
        sendAlert('Error: Game already exists!');
      }
    });
  } else {
    sendAlert("Error: Not connected to server");
  }
}

function openGame() {
  socket.emit('changeGameState', 'open');
  $("#room-message").text("Students, please join room ");
  changeState(state.currentState, 'open');
}

function closeGame() {
  socket.emit('changeGameState', 'closed');
  $("#room-message").text("");
  changeState(state.currentState, 'closed');
}

function deleteGame() {
  if (confirm('Are you sure you want to delete ' + state.gameName + '?')) {
    socket.emit('deleteGame');
    changeState("MAIN_SCREEN");
  }
}

function startGame() {
  socket.emit('startGame');
  changeState('PLAYING');
}

function stopGame() {
  socket.emit('stopGame');
  $("#room-message").text("");
  state.roomSize = 0;
  changeState("WAITING_ROOM_FILE_READY", 'closed');
}

function leaveGame(){
  if(confirm("Are you sure you want to leave? All your data will be saved")){
    changeState("MAIN_SCREEN");
  }
}

function playerResults(results) {
  if ($('#playerResults tr').length == 0) {
    $('#playerResults').append('<tr><th>Nickname</th><th>Score</th></tr>');
    for (player of results) {
      tr = '<tr id="' + getSelector(player[0]) + '"><td>' + player[0] + '</td><td class="score">' + player[1] + '</td></tr>';
      $('#playerResults').append(tr);
    }
  } else {
      for (player of results) {
        $("#" + getSelector(player[0]) + ' td.score').text(player[1]);
      }
  }
}

function downloadReport() {
  socket.emit('downloadReport');
}

function getSelector(input) {
  return input.replace(/[@.]/gi, '_');
}

function sendReport(questionResponses, people, questions) {
  //Final location for CSV Rows
  data = [];

  //Column names
  columns = [
    'First Name',
    'Last Name',
    'Email',
    'Nickname',
    'Score',
    'Number Answered',
    'Number Correct',
  ];

  //Add question text
  questions.forEach((question) => {
    columns.push(question.question);
  });
  data.push(columns);

  players = {};
  for (person of people) {
    player = [
      person.FirstName,
      person.LastName,
      person.Email,
      person.NickName,
      0, //Compute score from answered questions
      person.NumberAnswered,
      person.NumberCorrect
    ];
    //Add empty columns to be filled with scores
    player = player.concat(Array(questions.length).fill(0));
    players[person.PersonID] = player;
  }

  questionResponses.forEach((question) => {
    //Get offset to start of question list
    index = question.QuestionID + 7;
    person = question.PersonID;
    //Increment score
    players[person][4] += question.Score;
    players[person][index] = question.Score;
  });

  //Add players to data
  for (var key in players) {
    data.push(players[key]);
  }

  var download = function(content, fileName, mimeType) {
    var a = document.createElement('a');
    mimeType = mimeType || 'application/octet-stream';

    if (navigator.msSaveBlob) { // IE10
      navigator.msSaveBlob(new Blob([content], {
        type: mimeType
      }), fileName);
    } else if (URL && 'download' in a) { //html5 A[download]
      a.href = URL.createObjectURL(new Blob([content], {
        type: mimeType
      }));
      a.setAttribute('download', fileName);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      location.href = 'data:application/octet-stream,' + encodeURIComponent(content); // only this mime type is supported
    }
  }
  var finalVal = '';

for (var i = 0; i < data.length; i++) {
    var value = data[i];

    for (var j = 0; j < value.length; j++) {
        var innerValue = value[j].toString();
        var result = innerValue.replace(/"/g, '""');
        if (result.search(/("|,|\n)/g) >= 0)
            result = '"' + result + '"';
        if (j > 0)
            finalVal += ',';
        finalVal += result;
    }

    finalVal += '\n';
}

  download(finalVal, state.gameName + " Score Report.csv", 'text/csv;encoding:utf-8');
}
