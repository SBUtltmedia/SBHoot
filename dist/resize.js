$(window).resize(function() {
  resizeWindow();
});

function resizeWindow() {
  var w = $(window).width();
  var stageWidth;
  var stageHeight;
  var h = $(window).height();
  // If the aspect ratio is greater than or equal to 4:3, fix height and set width based on height
  if ((w / h) >= 4 / 3) {
    stageHeight = h;
    stageWidth = (4 / 3) * h;
    stageLeft = (w - stageWidth) / 2;
    stageTop = 0;
  }
  // If the aspect ratio is less than 4:3, fix width and set height based on width
  else {
    stageWidth = w;
    stageHeight = (3 / 4) * w;
    stageTop = (h - stageHeight) / 2;
    stageLeft = 0;
  }

  // Set "screen" object width and height to stageWidth and stageHeight, and center screen
  $("html").css({
    "font-size": stageWidth / 100 + "px",
  });
  //setQuestionTextSize()
}
resizeWindow()

function setQuestionTextSize() {
  var questionLength = $('#question').html().length;

  var maxLength = 90;
  var scalingFactor=.8;
  var startingFontSize=3;
  var largestAnswer = 0;
  $('.answer').each(function(el){
    largestAnswer = largestAnswer > $(this).html().length ? largestAnswer : $(this).html().length;
  })


  $('.answer').css({"font-size": Math.min(startingFontSize, startingFontSize*(maxLength/(largestAnswer*scalingFactor)))+"rem"})

  $('#question').css({"font-size": Math.min(startingFontSize, startingFontSize*(maxLength/(questionLength*scalingFactor)))*1.5+"rem"})
}
