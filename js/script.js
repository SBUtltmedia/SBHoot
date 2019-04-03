var currentQuestion;
var selected;
var timeInterval;

fetch('getQuestion.php')
  .then(function(response) {
    return response.json();
  })
  .then(function(myJson) {
    $("#question").text(myJson.question);
    $("#answer_0").text(myJson.answers[0]);
    $("#answer_1").text(myJson.answers[1]);
    $("#answer_2").text(myJson.answers[2]);
    $("#answer_3").text(myJson.answers[3]);
    console.log(myJson);
    currentQuestion = myJson;
    selected = "";
    generateRoomCode();
  });

// generate a random color for the body
function random_bg_color() {
  var x = getRandomInt(100, 256);
  var y = getRandomInt(100, 256);
  var z = getRandomInt(100, 256);

  var x1 = x - 30;
  var y1 = y - 30;
  var z1 = z - 30;

  var bgColor1 = "rgb(" + x + "," + y + "," + z + ")";
  var bgColor2 = "rgb(" + x1 + "," + y1 + "," + z1 + ")";
  var background = "repeating-linear-gradient(to bottom," +
    bgColor1 + "," + bgColor1 + " 20px," +
    bgColor2 + " 20px," + bgColor2 + " 40px)";
  return background;
}

//for random color generator
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

$(document).ready(function() {
  $(".answer").on("click", function(evt) {
    var ansClicked = evt.currentTarget.id;
    selected = ansClicked;
  });

  $("#submit").on("click", function(evt) {
    if ($("#submit").text() == "next question") {
      location.reload(true);
    } else {
      if (selected.indexOf("answer") >= 0) {
        answer = $("#" + selected).text();
        alert("Your answer, "+answer+", was submitted!");
        //This depends if all answers are in on server
          showCorrectAnswer(true);
      }
    }
  });

  function showCorrectAnswer(isSubmitted) {
    $("#submit").text("next question");
    clearInterval(timeInterval);
    $(".answer").css({
      "animation": "answerOff 0s forwards",
      "background-color": "#fffff0"
    });
    $("#timer").css("animation-play-state", "paused");
    if (isSubmitted) {
      if (currentQuestion.correct == selected.split("answer_")[1]) {
        $("#" + selected).css({
          "color": "#66ff00",
          "animation": "answerHover 1s infinite",
          "background-color": "#ffffc0"
        });
        $("#timer").text("\u2713");
        $("#timer").css("color", "#66ff00");
      } else {
        $("#" + selected).css("color", "red");
        correctAnswer = "#answer_" + currentQuestion.correct
        $(correctAnswer).css({
          "color": "#66ff00",
          "animation": "answerHover 3s infinite"
        });
        $("#timer").text("X");
        $("#timer").css({"color": "red", "text-align":"center"});
      }
    } else {
      correctAnswer = "#answer_" + currentQuestion.correct
      $(correctAnswer).css({
        "color": "#66ff00",
        "animation": "answerHover 3s infinite"
      });
      $("#timer").text("X");
      $("#timer").css({"color": "red", "text-align":"center"});
    }
  }

  $("body").on('DOMSubtreeModified', "#timer", function() {
    if ($("#timer").text() == "0") {
      alert("Your time is up!");
      $("#submit").text("next question");
      showCorrectAnswer(false);
    }
  });

});

function startTimer(duration, display) {
  var timer = duration,
    seconds;
  var cssChange = false;
  timeInterval = setInterval(function() {
    display.text(timer);

    if (timer <= 5) {
      if (!cssChange) {
        $("#timer").css({
          "color": "red",
          "animation": "lowTime 1s infinite"
        });
        cssChange=true;
      }
    }
    if (--timer < 0) {
      clearInterval(timeInterval);
    }
  }, 1000);
}

jQuery(function($) {
  $("#submit").text("submit answer");
  var time = 15,
    display = $('#timer');
  startTimer(time, display);
});


function generateRoomCode() {
  //Will most likely be different when server is connected
  var roomCode = getRandomInt(0,15).toString(16) + "" +
  getRandomInt(0,15).toString(16) + "" +
  getRandomInt(0,15).toString(16) + "" +
  getRandomInt(0,15).toString(16) + "" +
  getRandomInt(0,15).toString(16) + "" +
  getRandomInt(0,15).toString(16);
  console.log(roomCode);
}
