const net = require('net');
const EventEmitter = require('events');
const splitStream = require('./split-stream');

const random4digithex = () => Math.random().toString(16).split('.')[1].substr(0, 4);
const randomuuid = () => new Array(8).fill(0).map(() => random4digithex()).join('-');

module.exports = (options) => {
  const connections = new Map();
  const emitter = new EventEmitter();

  const handleNewSocket = (socket) => {
    const connectionId = randomuuid();

    connections.set(connectionId, socket);
    emitter.emit('_connect', connectionId);

    socket.on('close', () => {
      connections.delete(connectionId);
      emitter.emit('_disconnect', connectionId);
    });

    socket.pipe(splitStream()).on('data', (message) => {
      emitter.emit('_message', { connectionId, message });
    });
  };

  const server = net.createServer((socket) => handleNewSocket(socket));

  const _send = (connectionId, message) => {
    const socket = connections.get(connectionId);

    if (!socket) {
      throw new Error(`Attempt to send data to connection that does not exist ${connectionId}`);
    }

    socket.write(JSON.stringify(message));
  };

  const connect = (ip, port, cb) => {
    const socket = new net.Socket();

    socket.connect(port, ip, () => {
      handleNewSocket(socket);
      cb && cb();
    });

    return (cb) => socket.destroy(cb);
  };

  const listen = (port, cb) => {
    server.listen(port, '0.0.0.0', cb);

    return (cb) => server.close(cb);
  };

  const close = (cb) => {
    for (let [connectionId, socket] of connections) {
      socket.destroy();
    }

    server.close(cb);
  };

  const NODE_ID = randomuuid();
  const neighbors = new Map();

  const findNodeId = (connectionId) => {
    for (let [nodeId, $connectionId] of neighbors) {
      if (connectionId === $connectionId) {
        return nodeId;
      }
    }
  };

  // Once connection is established, send the handshake message
  emitter.on('_connect', (connectionId) => {
    _send(connectionId, { type: 'handshake', data: { nodeId: NODE_ID } });
  });

  emitter.on('_message', ({ connectionId, message }) => {
    const { type, data } = message;

    if (type === 'handshake') {
      const { nodeId } = data;

      neighbors.set(nodeId, connectionId);
      emitter.emit('connect', { nodeId });
    }

    if (type === 'message') {
      const nodeId = findNodeId(connectionId);

      // TODO handle no nodeId error

      emitter.emit('message', { nodeId, data });
    }
  });

  emitter.on('_disconnect', (connectionId) => {
    const nodeId = findNodeId(connectionId);

    // TODO handle no nodeId

    neighbors.delete(nodeId);
    emitter.emit('disconnect', { nodeId });
  });

  const send = (nodeId, data) => {
    const connectionId = neighbors.get(nodeId);

    // TODO handle no connection id error

    _send(connectionId, { type: 'message', data });
  };

  const alreadySeenMessages = new Set();

  const sendPacket = (packet) => {
    for (const $nodeId of neighbors.keys()) {
      send($nodeId, packet);
    }
  };

  const broadcast = (message, id = randomuuid(), origin = NODE_ID, ttl = 255) => {
    sendPacket({ id, ttl, type: 'broadcast', message, origin });
  };

  const direct = (destination, message, id = randomuuid(), origin = NODE_ID, ttl = 255) => {
    sendPacket({ id, ttl, type: 'direct', message, destination, origin });
  };

  emitter.on('message', ({ nodeId, data: packet }) => {
    if (alreadySeenMessages.has(packet.id) || packet.ttl < 1) {
      return;
    } else {
      alreadySeenMessages.add(packet.id);
    }

    if (packet.type === 'broadcast') {
      emitter.emit('broadcast', { message: packet.message, origin: packet.origin });
      broadcast(packet.message, packet.id, packet.origin, packet.ttl - 1);
    }

    if (packet.type === 'direct') {
      if (packet.destination === NODE_ID) {
        emitter.emit('direct', { origin: packet.origin, message: packet.message });
      } else {
        direct(packet.destination, packet.message, packet.id, packet.origin, packet.ttl - 1);
      }
    }
  });

  return {
    listen, connect, close,
    broadcast, direct,
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    id: NODE_ID,
    neighbors: () => neighbors.keys(),
  };
};