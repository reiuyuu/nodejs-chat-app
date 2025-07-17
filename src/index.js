const path = require("path");
const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const Filter = require("bad-words");
const { generateMessage, generateLocationMessage } = require("./utils/messages");
const { addUser, removeUser, getUser, getUsersInRoom } = require("./utils/users");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

require("dotenv").config();

const port = process.env.PORT || 3000;
const publicDirectoryPath = path.join(__dirname, "../public");

const customWords = [
  // Common English spellings
  "HSBC", "hsbc", "Hsbc", "HSBc", "HSbC", "hSbC", "hSBC", "HsbC", "hSbC",
  // Concatenated and variants
  "hsbcbank", "HSBCBANK", "hsbcgroup", "HSBCGROUP",
  // Chinese names
  "汇丰", "汇丰银行", "滙豐", "滙豐銀行",
  // English + Chinese
  "hsbc银行", "HSBC银行", "hsbc集團", "HSBC集團",
  // Pinyin
  "huifeng", "huifengyinhang",
  // Space separated
  "H S B C", "h s b c", "H s b c", "h S B C",
  // Symbol separated
  "H-S-B-C", "h-s-b-c", "H_S_B_C", "h_s_b_c", "H.S.B.C", "h.s.b.c",
  // Other common combinations
  "汇丰bank", "滙豐bank", "huifengbank", "huifeng银行",
  // Variants with symbols/numbers
  "h$bc", "h5bc", "h5bC", "h$bc银行"
];

app.use(express.static(publicDirectoryPath));

io.on("connection", socket => {
  console.log("New WebSocket connection");
  socket.on("join", (options, callback) => {
    console.log(`[socket.on] join: socket.id=${socket.id}, options=`, options);

    // 1. Check for latitude and longitude in options
    const { latitude, longitude } = options;
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      latitude < 55 || latitude > 70 ||
      longitude < 11 || longitude > 25
    ) {
      return callback("Sorry, this app is only available in Sweden.");
    }

    const { error, user } = addUser({ id: socket.id, ...options });
    if (error) {
      return callback(error);
    } else {
      socket.join(user.room);

      socket.emit("message", generateMessage("Admin", "Welcome!"));
      socket.broadcast.to(user.room).emit("message", generateMessage("Admin", `${user.username} has joined!`));
      io.to(user.room).emit("roomData", {
        room: user.room,
        users: getUsersInRoom(user.room)
      });

      callback();
    }
  });

  socket.on("sendMessage", (message, callback) => {
    const user = getUser(socket.id);
    console.log(`[socket.on] sendMessage: socket.id=${socket.id}, user=`, user, ", message=", message);

    // 1. use filter to check if the message is profane
    const filter = new Filter();
    if (filter.isProfane(message)) {
      return callback("Profanity is not allowed!");
    }

    // 2. use filter + addWords to clean the message
    filter.addWords(...customWords);
    const cleanMessage = filter.clean(message);

    // 3. send the cleaned message
    io.to(user.room).emit("message", generateMessage(user.username, cleanMessage));
    callback();
  });

  socket.on("sendLocation", (coords, callback) => {
    const user = getUser(socket.id);
    const { latitude, longitude } = coords;
    console.log(`[socket.on] sendLocation: socket.id=${socket.id}, user=`, user, ", coords=", coords);

    if(latitude > 3 && latitude < 53 && longitude > 73 && longitude < 135){
      console.log("u are accessing from China");
    }

    io.to(user.room).emit("locationMessage", generateLocationMessage(user.username, `https://www.google.com/maps?q=${latitude},${longitude}`));
    callback();
  });

  socket.on("disconnect", () => {
    const user = removeUser(socket.id);
    console.log(`[socket.on] disconnect: socket.id=${socket.id}, user=`, user);

    if (user) {
      io.to(user.room).emit("message", generateMessage("Admin", `${user.username} has left!`));
      io.to(user.room).emit("roomData", {
        room: user.room,
        users: getUsersInRoom(user.room),
      });
    }
  });
});

server.listen(port, () => {
  console.log(`Server is up on port ${port}!`);
});
