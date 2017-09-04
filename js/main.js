const fs = require("fs");
const stream = require('stream');
const Fili = require('fili');
const util = require("util");

var ctx, fd;
var bufferSize = 0,
  channels = 0;
var buffer = new Buffer(bufferSize);
var outputBuffer = new Uint8Array(10);
var frameCounter = 1;
var inputFile = "";
var outputFile = "";
var iirFilters = [];
var run = false;
var intervalId;
var iirCalculators = [], iirFilterCoeffs = [];
var saturated = 0;
var chunksProcessed = 0;
var ampli = 0;
var sampleRate = 0;
var stopAt = 0;

fs.readFile("default.conf.xml", "utf-8", function(err, data){
  if(err){
    return console.log(err);
  }
  var parser = new DOMParser();
  xmlDoc = parser.parseFromString(data, "text/xml");

  document.getElementById("conv-start").value = xmlDoc.getElementsByTagName("conv-start")[0].childNodes[0].nodeValue;
  document.getElementById("conv-len").value = xmlDoc.getElementsByTagName("conv-len")[0].childNodes[0].nodeValue;
  document.getElementById("ampli").value = xmlDoc.getElementsByTagName("ampli")[0].childNodes[0].nodeValue;
  document.getElementById("f-h").value = xmlDoc.getElementsByTagName("f-h")[0].childNodes[0].nodeValue;
  document.getElementById("f-l").value = xmlDoc.getElementsByTagName("f-l")[0].childNodes[0].nodeValue;
  document.getElementById("source-name").value = xmlDoc.getElementsByTagName("source-name")[0].childNodes[0].nodeValue;
  document.getElementById("source-de").value = xmlDoc.getElementsByTagName("source-de")[0].childNodes[0].nodeValue;
  document.getElementById("source-ra").value = xmlDoc.getElementsByTagName("source-ra")[0].childNodes[0].nodeValue;
  document.getElementById("center-freq").value = xmlDoc.getElementsByTagName("center-freq")[0].childNodes[0].nodeValue;
  document.getElementById("sample-rate").selectedIndex = xmlDoc.getElementsByTagName("sample-rate")[0].childNodes[0].nodeValue;
  document.getElementById("sr-error").value = xmlDoc.getElementsByTagName("sr-error")[0].childNodes[0].nodeValue;
  document.getElementById("ts-sample-rate").selectedIndex = xmlDoc.getElementsByTagName("ts-sample-rate")[0].childNodes[0].nodeValue;
  document.getElementById("nchans").selectedIndex = xmlDoc.getElementsByTagName("nchans")[0].childNodes[0].nodeValue;

});

function setupFilters(){
  irrFilters = [];
  for (var i=0; i<channels; i++){
    iirCalculators[i] = {fil1:new Fili.CalcCascades(), fil2:new Fili.CalcCascades()};

    iirFilterCoeffs[i] = {fil1: iirCalculators[i].fil1.highpass({
        order: 1,
        characteristic: 'butterworth',
        Fs: parseFloat(document.getElementById("ts-sample-rate").value),
        Fc: parseFloat(document.getElementById("f-l").value),
        gain: 1,
        preGain: false
      }),
      fil2:iirCalculators[i].fil2.lowpass({
          order: 3,
          characteristic: 'butterworth',
          Fs: parseFloat(document.getElementById("ts-sample-rate").value),
          Fc:  parseFloat(document.getElementById("f-h").value),
          gain: 1,
          preGain: false
        })};

    iirFilters[i] = {fil1:new Fili.IirFilter(iirFilterCoeffs[i].fil1), fil2:new Fili.IirFilter(iirFilterCoeffs[i].fil2)};
  }
}

function start(){
  if(!run){
    if(inputFile == ""){
      alert("First choose a file");
    }else{
      ctx = document.getElementById("graph").getContext("2d");
      channels = parseInt(document.getElementById("nchans").value);
      bufferSize = 2 * channels * 1000;
      buffer = new Buffer(bufferSize);
      fd = fs.openSync(inputFile, 'r');
      outputFile = document.getElementById("fil-file-input").value;
      try{
        fs.unlinkSync(outputFile);
      }catch(e){}
      writeHeader();
      setupFilters();
      chunksProcessed = 0;
      frameCounter = 0;
      saturated = 0;
      outputBuffer = new Uint8Array(bufferSize/2);
      sampleRate = parseFloat(document.getElementById("ts-sample-rate").value);
      ampli = parseFloat(document.getElementById("ampli").value);
      document.getElementById("start-button").className = "fa fa-stop";
      var startAt = Math.ceil(parseFloat(document.getElementById("conv-start").value) * sampleRate * channels * 2);
      stopAt = (parseFloat(document.getElementById("conv-len").value) * sampleRate * channels * 2) / bufferSize;
      console.log(startAt);

      readChunk(startAt);
      intervalId = setInterval(readChunk, 1);
      run = true;
    }

  }else{
    clearInterval(intervalId);
    document.getElementById("start-button").className = "fa fa-play";
    run = false;
  }

}

function writeHeader(){
  var Uint32Buffer = new Buffer(4);
  var doubleBuffer = new Buffer(8);

  var mjdTime = document.getElementById("mjd-visualizer").value;

  Uint32Buffer.writeUInt32LE(12, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "HEADER_START");

  Uint32Buffer.writeUInt32LE(9, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "data_type");
  Uint32Buffer.writeUInt32LE(1, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);

  Uint32Buffer.writeUInt32LE(4, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "nifs");
  Uint32Buffer.writeUInt32LE(1, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);

  Uint32Buffer.writeUInt32LE(12, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "telescope_id");
  Uint32Buffer.writeUInt32LE(0, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);

  Uint32Buffer.writeUInt32LE(4, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "nifs");
  Uint32Buffer.writeUInt32LE(1, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);

  Uint32Buffer.writeUInt32LE(5, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "nbits");
  Uint32Buffer.writeUInt32LE(8, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);

  var channelWidth = (parseInt(document.getElementById("sample-rate").value) / parseInt(document.getElementById("nchans").value)) / 1000000;

  Uint32Buffer.writeUInt32LE(4, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "foff");
  doubleBuffer.writeDoubleLE( -channelWidth, 0);
  fs.appendFileSync(outputFile, doubleBuffer);

  Uint32Buffer.writeUInt32LE(4, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "fch1");
  doubleBuffer.writeDoubleLE( parseFloat(document.getElementById("center-freq").value) + (parseInt(document.getElementById("sample-rate").value) / 2000000) - (channelWidth/2), 0);
  fs.appendFileSync(outputFile, doubleBuffer);

  Uint32Buffer.writeUInt32LE(6, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "nchans");
  Uint32Buffer.writeUInt32LE(parseInt(document.getElementById("nchans").value), 0);
  fs.appendFileSync(outputFile, Uint32Buffer);

  Uint32Buffer.writeUInt32LE(5, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "tsamp");
  doubleBuffer.writeDoubleLE( (1/parseInt(document.getElementById("ts-sample-rate").value)) * (1/(parseInt(document.getElementById("sr-error").value) / 1000000 + 1)), 0);
  fs.appendFileSync(outputFile, doubleBuffer);

  Uint32Buffer.writeUInt32LE(6, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "tstart");
  doubleBuffer.writeDoubleLE( mjdTime, 0);
  fs.appendFileSync(outputFile, doubleBuffer);

  var sourceName = document.getElementById("source-name").value;

  Uint32Buffer.writeUInt32LE(11, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "source_name");
  Uint32Buffer.writeUInt32LE(sourceName.length, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, sourceName);

  Uint32Buffer.writeUInt32LE(7, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "src_raj");
  doubleBuffer.writeDoubleLE(parseFloat(document.getElementById("source-ra").value), 0);
  fs.appendFileSync(outputFile, doubleBuffer);

  Uint32Buffer.writeUInt32LE(7, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "src_dej");
  doubleBuffer.writeDoubleLE(parseFloat(document.getElementById("source-de").value), 0);
  fs.appendFileSync(outputFile, doubleBuffer);

  Uint32Buffer.writeUInt32LE(10, 0);
  fs.appendFileSync(outputFile, Uint32Buffer);
  fs.appendFileSync(outputFile, "HEADER_END");
}

function resetSat(){
  chunksProcessed = 1;
  saturated = 0;
}

function fileSelected(){
  inputFile = document.getElementById("bin-file-input").files[0].path;
  document.getElementById("fil-file-input").value = inputFile.slice(0,inputFile.length-4) + ".fil";
  document.getElementById("fil-file-input").focus();
  document.getElementById("fil-file-input").setSelectionRange(inputFile.length, inputFile.length);

  fd = fs.openSync(inputFile, 'r');

  var stats = fs.statSync(inputFile);
  var mjdTime = ((Date.parse(stats.mtime) / 1000) / 86400) + 40587;
  document.getElementById("mjd-visualizer").value = mjdTime.toFixed(5);

}

function readChunk(startAt){
  if ((read = fs.readSync(fd, buffer, 0, bufferSize, (startAt == 0)?null:startAt)) !== 0) {
    ctx.fillStyle="#FFFFFF";
    ctx.fillRect(0,0,600,300);
    ctx.fillStyle="#000000";
    var tmpVal = 0;
    ctx.beginPath();
    ctx.moveTo(5, 1);
    ctx.lineTo(300,1);
    ctx.moveTo(5, 129);
    ctx.lineTo(300,129);
    ctx.stroke();

    ampli = parseFloat(document.getElementById("ampli").value);

    for (var i=0; i<bufferSize/2; i++){
      tmpVal = iirFilters[(i)%channels].fil2.singleStep(iirFilters[(i)%channels].fil1.singleStep(buffer.readInt16LE(i*2))) * ampli * 0.1 + 128;

      if (tmpVal > 255){
        tmpVal = 255;
        saturated++;
      }
      if(tmpVal < 0){
        tmpVal = 0;
        saturated++;
      }
      if (i<channels){
        ctx.beginPath();
        ctx.arc(6+(i*2*(146/(channels-1))), 129 - tmpVal/2, 2, 0, 2*Math.PI);
        ctx.stroke();
      }
      outputBuffer[(channels-1-((i)%channels)) + Math.floor((i)/channels)*channels] = tmpVal;
    }

    fs.appendFileSync(outputFile, new Buffer(outputBuffer));
    document.getElementById("processed").innerHTML = frameCounter * (1000/sampleRate);
    document.getElementById("%sat").innerHTML = (saturated / (chunksProcessed * (bufferSize / 2)) * 100).toFixed(3);
    frameCounter++;
    chunksProcessed++;

    if(frameCounter > stopAt){
      start();
    }
  }else{
    if(run){
      start();
    }else{
      alert("CONVStart out of range!");
    }
  }
}
