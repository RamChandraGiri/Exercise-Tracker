"use strict";

const express = require("express");
const app = express();

const bodyParser = require("body-parser");

// shortid generator without specified number of characters
// for only alphanumeric characters uncomment shortid.characters()
const shortid = require("shortid");
//shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$&');

const cors = require("cors");

// Connect to mongoose
const mongoose = require("mongoose");
mongoose
  .connect(process.env.MLAB_URI || "mongodb://localhost/exercise-track", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false, // https://stackoverflow.com/questions/52572852/deprecationwarning-collection-findandmodify-is-deprecated-use-findoneandupdate
  })
  .then(() => {
    console.log("Connected to Mongo!");
  })
  .catch((err) => {
    console.error("Error connecting to Mongo", err);
  });

app.use(cors());

// Use NodeJS promises instead of built in ones
// Because the promise library
// in mongoose is now deprecated.
mongoose.Promise = global.Promise;

// BodyParser
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

/** # SCHEMAS and MODELS # */

// Set up the user schema
var Schema = mongoose.Schema;

// Create a simple schema without many condition in them, as it may cause error with test
// Schema for creating username and id
// const userSchema = new Schema({
//   username: {
//     type: String,
//     required: true,
//     trim: true//, // if somebody enters whitespaces it doesn't work but if starts with letter will trim whitespaces and check for duplicates
//     //unique: true, // handled inside
//     //minLength: 3  // handled inside
//   },
//   _id: {
//     type: String,
//     index: true,
//     default: shortid.generate
//   },
//   count: Number,
//   // Log is and array of required add exercise
//   Log: [{
//     _v: false,
//     _id: false,
//     description: {
//       type: String,
//       required: true,
//       maxLength: [20, 'description too long']
//     },
//     duration: {
//       type: Number,
//       required: true,
//       min: [1, 'duration too short']
//     },
//     date: {
//       type: Date,
//       default: Date.now
//     }
//   }]
// });

// Schema for creating username and id
const userSchema = new Schema({
  username: { type: String, required: true, index: { unique: true } },
  _id: { type: String, required: true },
  count: Number,
  log: [
    {
      __v: false,
      _id: false,
      description: String,
      duration: Number,
      date: { type: Date, default: Date.now },
    },
  ],
});

// Created a User model
const User = mongoose.model("User", userSchema);

/** Our API endpoints... */

// New user API returns {"username":"entered name","_id":"generated id"}
app.post("/api/exercise/new-user", function (req, res) {
  const new_user = req.body.username;
  if (new_user) {
    // if (new_user.length < 3) {
    //   res.json("Username length should be 3 or greater");
    // } else {
    //   // For minimum length
    // }

    User.findOne({ username: new_user }, function (err, data) {
      if (err) {
        res.json(err);
      }
      if (data) {
        res.json("Username already taken");
      } else {
        let user = new User({ username: new_user, _id: shortid.generate() });
        user.save().then((saved) => {
          res.json({ username: saved.username, _id: saved._id });
        });
      }
    });
  } else {
    res.json("No username provided");
  }
});

// Adding exercise with user id provided while creating new user
// returns {"userId":"generated id","description":" string of description",
// "duration":number in min,"date":"Day month date year","username":"username of generated id"}
app.post("/api/exercise/add", function (req, res) {
  // defining all the items obtained from form
  let user_id = req.body.userId,
    description = req.body.description,
    duration = parseInt(req.body.duration),
    date = req.body.date ? new Date(req.body.date) : new Date();

  if (req.body.userId) {
    User.findOne({ _id: user_id }, function (err, data) {
      if (err) res.json(err);
      if (!data || data._id !== user_id) {
        res.json("no valid ID exists");
      } else {
        User.findByIdAndUpdate(
          { _id: user_id },
          { $push: { log: { description, duration, date } } },
          { upsert: true, new: true },
          function (err, data) {
            if (err) res.json(err);
            if (!data) {
              res.json("no valid ID exits");
            } else {
              res.json({
                _id: data._id,
                description,
                duration,
                date: date.toDateString(),
                username: data.username,
              });
            }
          }
        );
      }
    });
  } else {
    res.json("no ID given");
  }

  if (!description) {
    res.json("description is required.");
  }
  if (!duration) {
    res.json("duration is required.");
  }
});

// Getting an array of all users by getting api/exercise/users with the same info as when creating a user.
app.get("/api/exercise/users", function (req, res, next) {
  User.find({}, { log: false }, function (err, data) {
    if (err) next(err);
    res.json(data);
  });
});

// Retrieve a full exercise log of any user by getting /api/exercise/log with a parameter of userId(_id).
// Return will be the user object with added array log and count (total exercise count).
// Also retrieve part of the log of any user by also passing along optional parameters of from & to or limit.
// (Date format yyyy-mm-dd, limit = int)
app.get("/api/exercise/log", function (req, res) {
  User.findOne({ _id: req.query.userId }, function (err, user) {
    if (err) return res.json(err);
    if (!user) {
      res.json("incorrect ID given");
    } else {
      let limit = parseInt(req.query.limit),
        exercise = user.log,
        // if form and to is not provided display logs from 1970-01-01 to current time.
        from = req.query.from ? new Date(req.query.from) : new Date("1970-01-01"), 
        // Date objects contain a Number that represents milliseconds since 1 January 1970 UTC.
        to = req.query.to ? new Date(req.query.to) : new Date();

      //filter date range between from and to
      exercise = exercise.filter(
        (data) => data.date >= from && data.date <= to
      );
      //sort dates from newest to oldest
      exercise = exercise
        .sort((first, second) => first.date < second.date)
        //map over every item of log with formatted date
        .map((item) => ({
          description: item.description,
          duration: item.duration,
          date: item.date.toDateString(),
        }));
      // if provided limit is NaN or there are more entries of exercises then slice upto limit
      if (!isNaN(limit) && exercise.length >= limit) {
        exercise = exercise.slice(0, limit);
      }

      res.json({
        _id: user._id,
        username: user.username,
        from: req.query.from ? new Date(req.query.from).toDateString() : undefined,
        to: req.query.to ? new Date(req.query.to).toDateString() : undefined,
        count: exercise.length,
        log: exercise,
      });
    }
  });
});

// Not found middleware
app.use((req, res, next) => {
  return next({ status: 404, message: "not found" });
});

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage;

  if (err.errors) {
    // mongoose validation error
    errCode = 400; // bad request
    const keys = Object.keys(err.errors);
    // report the first validation error
    errMessage = err.errors[keys[0]].message;
  } else {
    // generic or custom error
    errCode = err.status || 500;
    errMessage = err.message || "Internal Server Error";
  }
  res.status(errCode).type("txt").send(errMessage);
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});

// References: 
// https://github.com/freeCodeCamp/freeCodeCamp/blob/master/curriculum/challenges/english/05-apis-and-microservices/apis-and-microservices-projects/exercise-tracker.english.md
// https://github.com/ozubergz/exercise-tracker/blob/master/server.js
// https://medium.com/@beaucarnes/learn-the-mern-stack-by-building-an-exercise-tracker-mern-tutorial-59c13c1237a1