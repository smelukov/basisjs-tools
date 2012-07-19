
var path = require('path');
var at = require('./ast_tools');
var RESOURCE = at.normalize('this.__resources__');

module.exports = function(flowData){

  var packages = {};
  var queue = flowData.files.queue;
  
  for (var i = 0, file; file = queue[i]; i++)
    if (file.type == 'script' && file.package)
    {
      var package = packages[file.package];
      if (!package)
        package = packages[file.package] = [];

      package.push.apply(package, buildDep(file, file.package));
    }

  flowData.js.packages = packages;

  // create package files
  //["dot",["name","this"],"__resource__"]

  // build source map
  var basisFile = flowData.files.get(flowData.js.basisScript);
  var htmlInsertPoint = basisFile.htmlInsertPoint;

  delete basisFile.htmlInsertPoint;

  // inject resources
  var inserted = false;
  var resourceToc = [];
  var resTypeByFirstChar = {
    '[': 'array',
    '{': 'object',
    '"': 'string',
    'f': 'function'
  };

  basisFile.ast = at.walk(basisFile.ast, {
    'dot': function(expr){
      if (!inserted && at.translate(this) == RESOURCE)
      {
        inserted = true;
        return at.parse('0,' + (function(){
          var res = [];
          var resourceTypeWeight = {
            'json': 1,
            'template': 2,
            'script': 100
          };

          for (var jsRef in flowData.js.resourceMap)
          {
            var file = flowData.js.resourceMap[jsRef];
            var content = file.jsResourceContent || file.outputContent || file.content;

            if (typeof content == 'function')
              content = content.toString().replace(/function\s+anonymous/, 'function');
            else
              content = JSON.stringify(content);

            res.push([file, file.jsRef, content]);
          }

          return '{\n' +
            res.sort(function(a, b){
              var wa = resourceTypeWeight[a[0].type] || 0;
              var wb = resourceTypeWeight[b[0].type] || 0;
              return wa > wb ? 1 : (wa < wb ? -1 : 0);
            }).map(function(item){
              resourceToc.push('[' + (resTypeByFirstChar[item[2].charAt(0)] || 'unknown') + '] ' + item[0].relpath + ' -> ' + item[1]);
              return '"' + item[1] + '":' + item[2]
            }).join(',\n') + 
          '\n}';
        })())[1][0][1][2];
      }
    }
  });

  for (var name in packages)
  {
    flowData.console.log('Package ' + name + ':\n  ' + packages[name].map(function(f){ return f.relpath }).join('\n  '));

    var isCoreFile = flowData.options.jsSingleFile || packageName == 'basis';
    var packageFile = flowData.files.add({
      type: 'script',
      outputFilename: name + '.js',
      outputContent: 
        (isCoreFile ? '// resources (' + resourceToc.length + '):\n//  ' + resourceToc.join('\n//  ') + '\n//\n' : '') +
        wrapPackage(packages[name], flowData, isCoreFile ? at.translate(basisFile.ast) : '')
    });

    if (isCoreFile)
    {
      packageFile.htmlInsertPoint = htmlInsertPoint;
    }
  }
}
module.exports.handlerName = '[js] Make packages';

//
// make require file list
//

function buildDep(file, package){
  var files = [];

  if (file.processed || file.package != package)
    return files;

  file.processed = true;

  for (var i = 0, depFile; depFile = file.deps[i++];)
    files.push.apply(files, buildDep(depFile, file.package));

  files.push(file);

  return files;
}

//
// wrap package
//

function extractBuildContent(file){
  return '// ' + file.relpath + '\n' +
    '[' +
      '"' + file.namespace + '", function(basis, module, exports, resource, global, __dirname, __filename){' +
        file.outputContent +
      '}' + 
    ']';
}

function extractSourceContent(file){
  return '//\n// ' + file.relpath + '\n//\n' +
    '{\n' +
    '  ns: "' + file.namespace + '",\n' + 
    '  path: "' + path.dirname(file.relpath) + '/",\n' + 
    '  fn: "' + file.basename + '",\n' +
    '  body: function(){\n' +
         file.outputContent + '\n' +
    '  }\n' + 
    '}';
}

var packageWrapper = [
  "(function(){\n" +
  "'use strict';\n\n",

  "\n}).call(this);"
];

function wrapPackage(package, flowData, contentPrepend){
  return !flowData.options.buildMode
    // source mode
    ? [
        '// filelist (' + package.length + '): \n//   ' + package.map(function(file){
          return file.relpath;
        }).join('\n//   ') + '\n',

        packageWrapper[0],
        contentPrepend,

        ';[\n',
          package.map(extractSourceContent).join(',\n'),
        '].forEach(' + function(module){
           var path = module.path;    
           var fn = path + module.fn;
           var ns = basis.namespace(module.ns);
           ns.source_ = Function.body(module.body);
           ns.filename_ = module.path + module.fn;
           new Function('module, exports, global, __filename, __dirname, basis, resource',
             '/** @namespace ' + ns.path + ' */\n' + ns.source_ + '//@ sourceURL=' + fn
           ).call(ns, ns, ns.exports, this, fn, path, basis, function(url){ return basis.resource(path + url) });
           Object.complete(ns, ns.exports);
         } + ', this)',

        packageWrapper[1]
      ].join('')
    // build mode
    : [
        '// filelist (' + package.length + '): \n//   ' + package.map(function(file){
          return file.relpath;
        }).join('\n//   ') + '\n',

        packageWrapper[0],
        contentPrepend,

        ';[\n',
          package.map(extractBuildContent).join(',\n'),
        '].forEach(' + function(module){
           var fn = module[1];
           var ns = basis.namespace(module[0]);
           // basis, module, exports, resource, global, __dirname, __filename
           fn.call(ns, basis, ns, ns.exports, basis.resource, this, "", "");
           Object.complete(ns, ns.exports);
         } + ', this)',

        packageWrapper[1]
      ].join('');
}
