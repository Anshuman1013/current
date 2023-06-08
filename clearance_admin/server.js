const xlsx = require("xlsx");
const fileUpload = require("express-fileupload");
const express = require("express");
const morgan = require("morgan");
const dotenv = require("dotenv");
const flash = require('express-flash');
const session = require("express-session");
const mysql = require("mysql");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
dotenv.config({ path: "config.env" });
const { PrismaClient } = require("@prisma/client");

const path = require("path");
const app = express();
const port = 8081;

const prisma = new PrismaClient();

let mysqlx = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "clrs",
});

// mysqlx.connect((err) => {
//   if (!err) {
//     console.log("db connection successful");
//   } else {
//     console.log("db connection failed" + JSON.stringify(err, undefined, 2));
//   }
// });

app.use(morgan("tiny"));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.set("view engine", "ejs");
app.use(
  session({
    cookie: { maxAge: 10 * 60 * 1000 },
    secret: "woot",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(flash());
app.use(express.static('public'));


const passportFirst = require("passport");
app.use("/adminlogin", passportFirst.initialize());
app.use("/adminlogin", passportFirst.session());
app.use(flash());


// passportFirst.use(
//   "local-first",
//   new LocalStrategy((username, password, done) => {
//     mysqlx.query(
//       "SELECT * FROM adminusers WHERE username = ? AND password = ?",
//       [username, password],
//       (err, results) => {
//         if (err) return done(err);
//         if (results.length === 0) {
//           return done(null, false, {
//             message: "Incorrect username or password",
//           });
//         }
//         const user = results[0];
//         return done(null, user);
//       }
//     );
//   })
// );


passportFirst.use(
  "local-first",
  new LocalStrategy(async (username, password, done) => {
    try {
      const adminUser = await prisma.adminusers.findFirst({
        where: {
          username: username,
          password: password,
        },
      });

      if (!adminUser) {
        return done(null, false, {
          message: "Incorrect username or password",
        });
      }

      return done(null, adminUser);
    } catch (err) {
      return done(err);
    }
  })
);


passportFirst.serializeUser((user, done) => {
  done(null, user.username);
});

passportFirst.deserializeUser((username, done) => {
  prisma.adminusers
  .findFirst({
    where: {
      username: username,
    },
  })
  .then((user) => {
    return done(null, user);
  })
  .catch((err) => {
    return done(err);
  });
});


app.post("/adminlogin", function (req, res, next) {
  passport.authenticate("local-first", function (err, user, info) {
    if (err) {
      return next(err);
    }
    if (!user) {
      req.flash("error", info.message);
      return res.redirect("/adminlogin");
    }
    req.logIn(user, function (err) {
      if (err) {
        return next(err);
      }

      req.session.username = req.user.username;
      res.redirect("/excelupload");
    });
  })(req, res, next);
});

app.get("/", function (req, res) {
  res.render("index", { user: req.user });
});


app.get("/adminlogin", function (req, res) {
  res.render("adminlogin", { message: req.flash("error") });
});

app.get("/excelupload", ensureAuthenticated, (req, res) => {
  res.render("excelupload");
});

app.use(fileUpload());



app.post("/upload", async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send("No files were uploaded.");
  }

  let uploadedFile = req.files.myfile;
  let uploadPath = path.join(__dirname, "uploads", "testexcel.xlsx");

  uploadedFile.mv(uploadPath, async (err) => {
    if (err) {
      // Error occurred while saving the file
      console.error(err);
      return res.status(500).send("Error occurred while uploading the file.");
    }

    let workbook = xlsx.readFile(uploadPath);
    let worksheet = workbook.Sheets[workbook.SheetNames[0]];
    let data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    let values = [];
    for (let i = 1; i < data.length; i++) {
      let row = data[i];
      values.push({
        Registration_Number: row[0],
        Name: row[1],
        Roll_Number: parseInt(row[2]),
        Branch: row[3],
        Course: row[4],
        Semester: row[5].toString(),
        Section: row[6],
        Session: row[7],
        Year: parseInt(row[8]),
        Mobile_Number: row[9].toString(),
        Email: row[10],
      });
    }

    console.log(values);

    try {
      await prisma.upload.createMany({ data: values });
      res.send("File uploaded and data inserted to the database.");
    } catch (err) {
      // Error occurred while inserting data
      const errorMessage = err.message;
      const errorHTML = `<div class="error-message">
        <span class="error-icon">&#9888;</span>
        <span class="error-text">${errorMessage}</span>
      </div>`;
      return res.status(500).send(`Error occurred while inserting data to the database: ${errorHTML}`);
    }
  });
});


function ensureAuthenticated(req, res, next) {
  if (req.session.username) {
    console.log(req.session.username);
    return next();
  } else {
    res.redirect("/adminlogin");
  }
}

app.listen(port, () => {
  console.log(`server is running`);
});

app.get("/logout", function (req, res) {
  req.session.destroy(function (err) {
    if (err) {
      console.error("Error destroying session: ", err);
    }
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});