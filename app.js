var http = require('http');
var request = require('request');
var cheerio = require ('cheerio');
var stream = require('stream');
var fs = require('fs');
var path = require('path');
var url = require('url');
var archiver = require('archiver');




function getTransformStream(url, recLevel, replaceManager, downloadedFiles, doCrawlAndDownloadResource) {
  var transformStream = new stream.Transform();
  var buffer='';

  transformStream._transform = function(chunk, encoding, callback) {    
    buffer += chunk.toString();
    callback();
  };

  transformStream._flush = function(callback){
    this.push(transformStream._replace(buffer));
    callback();
  }

  transformStream._replace = function(chunk){
      $ = cheerio.load(chunk);
      $('a').each(function (i, link){
        var newUrl = $(this).attr('href'); 
        var downloadableURL = URLManager.getDownloadableURL(url,newUrl);
        var newUrlName = replaceManager.lookupName(downloadableURL);
        $(this).attr('href', newUrlName);

        doCrawlAndDownloadResource(downloadableURL,
          recLevel-1, replaceManager, newUrlName, downloadedFiles); 
      }); //end $a.each
      return $.html();
  }; 

  return transformStream;  
}

//CLASE URL MANAGER

function URLManager() {
}

URLManager.getResourceExtension = function(uri){
  var urlObject = url.parse(uri,true)
  var string = ".html"
  if(urlObject.query.url != undefined)
  {
    string = path.parse(urlObject.query.url)
  }
  return string
}

URLManager.getDownloadableURL = function(urlParent, href){
  var string = ""
  if(href != undefined){
    string = url.resolve(urlParent,href)
  }
  return string
}

//CLASE REPLACEMANAGER

function ReplaceManager(maxFiles){
  var _fileCounter = 0
  var _replaceMap = {}
  this.lookupName = function(_url){
    var extension = URLManager.getResourceExtension(_url)
    if(_replaceMap[_url] == undefined){
      if (_fileCounter < maxFiles){
        if (_fileCounter == 0 ){
          _replaceMap[_url] = "index.html"
        }
        else {
          _replaceMap[_url] = _fileCounter + extension
        }
        _fileCounter = _fileCounter + 1
        return _replaceMap[_url]
      }
      else {
        return ReplaceManager._NOT_FOUND_FILE
      }
    }
    return _replaceMap[_url]
  };
}

ReplaceManager._NOT_FOUND_FILE = "_404.html"

function routeRequests(req, res){
  var tmp = url.parse(req.url, true);
  switch(tmp.pathname){
    case '/':
      res.writeHead(200, {"Content-Type" : "text/html"});
      fs.createReadStream('./view/index.html').pipe(res);
      break;
    case '/crawler':
      if(tmp.search != null){
        //replaceManager = new ReplaceManager(2)
        //replaceManager.lookupName("http://deic.uab.cat/~mc/stw/nodeJS/webArchiver/test.html")
        //URLManager.getDownloadableURL("http://www.google.es","test.html")
        //URLManager.getResourceExtension("http://www.google.es/a.pdf")
        startCrawling(req, res, tmp.query);
      }
      break;
    default:
      console.log("Esto es la entrada default.")
  }
  // TODO
}

function startCrawling(req, res, queryReq){
  var uri = queryReq.url;
  var recLevel = queryReq.recLevel;
  var maxFiles = queryReq.maxFiles;
  var replaceManager = new ReplaceManager(maxFiles);
  var counter = 0

  res.writeHead(200, {"Content-Type" : "application/zip", 
  "Content-Disposition" : "attachment; filename=files.zip"});
  // "Creamos" el archivo zip
  var zip = archiver('zip');
  // Añadimos una funcion de informacion al acabar y cerramos el stream
  // de respuesta
  zip.on('finish', function() {
    console.log("Zip file has been sent, with a total of " + zip.pointer() + " bytes.");
    res.end();
  });
  // Pasamos el stream de lectura zip al stream de escritura res.
  zip.pipe(res);
  // doCrawlAndDownloadResource tiene que ser una clausura ya que
  // necesitamos el parametro 'res' para enviar la respuesta al cliente
  doCrawlAndDownloadResource = function(uri, recLevel, replaceManager, entryName, downloadedFiles) {
    console.log("uri: " + uri)
    console.log("reclevel: " + recLevel)
    console.log("entryname: " + entryName)
    console.log(downloadedFiles)
    if (entryName == "_404.html" || recLevel == 0 || downloadedFiles.includes(entryName)){
      console.log("file already downloaded or max level reached or 404")
      return false
    }
    else{
      counter = counter + 1
      console.log(counter)
      var outStream = request.get(uri)
      var transformStream = getTransformStream(uri, recLevel, replaceManager,  downloadedFiles, doCrawlAndDownloadResource)
      outStream.pipe(transformStream)
      outStream.on("end", function(){
        counter-=1;
        if (counter == 0){
          zip.finalize()
        }
      });
      zip.append(transformStream,{name: entryName})
      downloadedFiles.push(entryName)
    }

  };
  var entryName = replaceManager.lookupName(uri);
  doCrawlAndDownloadResource(uri, recLevel, replaceManager, entryName, []);
}



http.createServer(routeRequests).listen(8081);