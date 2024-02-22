CREATE TABLE Room (
   RoomID integer,
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
    personID integer,
    roomID integer,
    questionID integer,
    score real

);
CREATE TABLE Person (
    personID integer,
    email string
);

