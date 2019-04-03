<?
$questionsJSON = json_decode(file_get_contents("questions.json"));
print_r (json_encode($questionsJSON[rand(0,count($questionsJSON)-1)]));
?>
