
var path = require('path');

module.exports = function(flowData){
  var fconsole = flowData.console;

  // merge files
  if (flowData.options.cssSingleFile)
  {
    var outputFiles = flowData.css.outputFiles;
    var newOutputFiles = [];
    var idx = 1;

    for (var i = 0, file, prev; file = outputFiles[i]; i++)
    {
      var filename = file.outputFilename;
      if (prev && prev.media == file.media)
      {
        prev.ast.push.apply(prev.ast, file.ast.slice(2));
        flowData.html.replaceToken(file.htmlInsertPoint, { type: 'text', data: '' })
      }
      else
      {
        if (prev)
          fconsole.decDeep();

        prev = file;
        newOutputFiles.push(file);

        file.outputFilename = path.dirname(file.outputFilename) + '/style' + (idx++) + '.css';
        fconsole.log('Merge into ' + file.outputFilename);
        fconsole.incDeep();
      }

      fconsole.log(filename);
    }

    flowData.css.outputFiles = newOutputFiles;
  }
  else
  {
    console.log('Skiped.\nDon\'t use --no-css-single-file or --no-single-file to allow css file merge.');
  }
}

module.exports.handlerName = 'Merge CSS files';