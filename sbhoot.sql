CREATE TABLE Room (
   RoomID integer PRIMARY KEY,
   Name string,
   InstructorID integer,
   State string
);
CREATE TABLE player(
  NumberAnswered integer,
  NumberCorrect integer,
  PersonID integer,
  NickName string,
  RoomID integer
);
CREATE TABLE answer(
  PersonID integer,
  RoomID integer,
  QuestionID integer,
  Score real

);
CREATE TABLE Person (
    PersonID integer PRIMARY KEY,
    Email string,
    FirstName string,
    LastName string
);