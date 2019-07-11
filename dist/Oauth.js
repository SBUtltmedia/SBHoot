// Enter an API key from the Google API Console:
//   https://console.developers.google.com/apis/credentials
var apiKey = 'AIzaSyC3UWd43m7c6zJt1hV9d3uicrgi3fUU9jM';

// Enter the API Discovery Docs that describes the APIs you want to
// access. In this example, we are accessing the People API, so we load
// Discovery Doc found here: https://developers.google.com/people/api/rest/
var discoveryDocs = ["https://people.googleapis.com/$discovery/rest?version=v1"];

// Enter a client ID for a web application from the Google API Console:
//   https://console.developers.google.com/apis/credentials?project=_
// In your API Console project, add a JavaScript origin that corresponds
//   to the domain where you will be running the script.
var clientId = '850953999855-4urhucipt81qjaf5qph87ovb0n6403uu.apps.googleusercontent.com';

// Enter one or more authorization scopes. Refer to the documentation for
// the API or https://developers.google.com/people/v1/how-tos/authorizing
// for details.
var scopes = 'profile';

var authorizeButton = document.getElementById('authorize-button');
var signoutButton = document.getElementById('signout-button');
var name;
var email;
var firstName;
var lastName;
var roomURL;
$(function() {
  roomURL = location.hash.split('#')[1] || "yourClass";
  $('#authorize-button').on("click", handleAuthClick);
  $('#signout-button').on("click", handleSignoutClick);
  handleClientLoad();
})

function handleClientLoad() {
  // Load the API client and auth2 library
  gapi.load('client:auth2', initClient);
}

function initClient() {
  gapi.client.init({
    apiKey: apiKey,
    discoveryDocs: discoveryDocs,
    clientId: clientId,
    scope: scopes
  }).then(function() {
    // Listen for sign-in state changes.
    gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);

    // Handle the initial sign-in state.
    updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
  });
}

function updateSigninStatus(isSignedIn) {
  if (isSignedIn) {
    makeApiCall();
  } else {
    changeState("LOGIN");
  }
}

function handleAuthClick(event) {
  gapi.auth2.getAuthInstance().signIn();
}

function handleSignoutClick(event) {
  gapi.auth2.getAuthInstance().signOut();
}

// Load the API and make an API call.  Display the results on the screen.
function makeApiCall() {
  gapi.client.people.people.get({
    'resourceName': 'people/me',
    'personFields': 'names,emailAddresses'
  }).then(function(resp) {
    var p = document.createElement('p');
    name = resp.result.names[0].displayName;
    email = resp.result.emailAddresses[0].value;
    firstName = resp.result.names[0].givenName;
    lastName = resp.result.names[0].familyName;
    $('#greeting').text('Hello, ' + name + '!');
    changeState("MAIN_SCREEN");
  });
}
