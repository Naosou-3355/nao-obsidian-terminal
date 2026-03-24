/**
 * Fork-based replacement for node-pty's Worker-based conoutSocketWorker.
 * Runs in a child process via child_process.fork().
 *
 * Receives conoutPipeName via process.argv[2].
 * Connects to conpty's output pipe, creates a named pipe server for the
 * parent process to connect to, then signals ready via IPC.
 */
"use strict";

const net = require("net");

const conoutPipeName = process.argv[2];
if (!conoutPipeName) {
  process.exit(1);
}

function getWorkerPipeName(pipeName) {
  return pipeName + "-worker";
}

const conoutSocket = new net.Socket();
conoutSocket.setEncoding("utf8");
conoutSocket.connect(conoutPipeName, function () {
  const server = net.createServer(function (workerSocket) {
    conoutSocket.pipe(workerSocket);
  });
  server.listen(getWorkerPipeName(conoutPipeName));

  // Signal ready to parent process
  if (process.send) {
    process.send({ type: "ready" });
  }
});

// Keep alive until parent disconnects
process.on("disconnect", function () {
  process.exit(0);
});
