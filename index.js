var app = require('electron').app
var BrowserWindow = require('electron').BrowserWindow;

global.sharedObject = {prop1: process.argv}

app.on("ready", function(){
  var mainWindow = new BrowserWindow({
    width:1050,
    height:790
  });
  mainWindow.loadURL("file://" + __dirname + "/index.html");
})
