
const fs = require('fs');
var mysql = require('mysql');
let DBInfo = JSON.parse(fs.readFileSync('DBConnect.json'));
var con = mysql.createConnection({
  host: DBInfo.host,
  database: DBInfo.database,
  user: DBInfo.username,
  password: DBInfo.password
});

const dbpromise =  new Promise(function(resolve, reject) {

con.connect(function(err) {
  if (err) {
    console.error('Error connecting: ' + err.stack);
    return;
  }
      resolve(con);
});

})
module.exports.dbpromise = dbpromise;
//
