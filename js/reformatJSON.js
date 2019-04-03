var a =["A", "B", "C", "D"];
var questions = [];
fetch('questions.json')
  .then(function(response) {
    return response.json();
  })
  .then(function(myJson) {
for (i of myJson){
var question = {};
var answers = [];
  for(j of a){

    answers.push(i[j]);
  }
  question.question = i.question;
  question.answers=answers;
  question.correct = a.indexOf(i.answer);
  questions.push(question);

}
console.log(JSON.stringify(questions));


  });
