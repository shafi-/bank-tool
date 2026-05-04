const fs = require('fs');
const http = require('http');
const path = require('path');
const arg = process.argv.slice(2);
const rootdir = arg[0] || process.cwd();
const port = process.env.PORT || 9000;
const hostname = process.env.HOST || '127.0.0.1';

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.cjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
};

http.createServer(function (req, res) {
  try {
    const req_url = decodeURIComponent(req.url).replace(/\/+/g, '/');
    const fullPath = path.normalize(path.join(rootdir, req_url));

    if (!fullPath.startsWith(path.normalize(rootdir))) {
      res.writeHead(403);
      res.end('Access Denied');
      return;
    }

    const stats = fs.statSync(fullPath);

    if (stats.isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);

      const buffer = fs.createReadStream(fullPath);
      buffer.on('open', () => buffer.pipe(res));
      buffer.on('error', () => {
        res.writeHead(500);
        res.end('Internal Server Error');
      });
      return;
    }

    if (stats.isDirectory()) {
      const lsof = fs.readdirSync(fullPath, {encoding:'utf8', withFileTypes:false});
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(html_page(`http://${hostname}:${port}`, req_url, lsof));
      return;
    }
  } catch (err) {
    let statusCode = 404;
    let message = 'Not Found';

    if (err.code === 'EACCES' || err.code === 'EPERM') {
      statusCode = 403;
      message = 'Access Denied';
    } else if (err.code === 'ENOENT') {
      statusCode = 404;
      message = 'Not Found';
    }

    res.writeHead(statusCode);
    res.end(message);
    return;
  }
}).listen(port, hostname, () => console.log(`Server running at http://${hostname}:${port}`));

function html_page(host, req_url, lsof) {
  const list = req_url == '/' ? [] : [`<a href="${host}">/</a>`, `<a href="${host}${encodeURI(req_url.slice(0,req_url.lastIndexOf('/')))}">..</a>`];
  const templete = (host, req_url, file) => `<a href="${host}${encodeURI(req_url)}${req_url.slice(-1) == '/' ? '' : '/'}${encodeURI(file)}">${file}</a>`;
  lsof.forEach(file => list.push(templete(host, req_url, file)));
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta http-equiv="content-type" content="text/html" charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Directory of ${req_url}</title>
</head>
<body>
<h2>Directory of ${req_url}</h2>
${list.join('<br/>\n')}
</body>
</html>`;
}
