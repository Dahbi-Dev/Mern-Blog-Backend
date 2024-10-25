const express = require("express");
const cors = require("cors");
const app = express();
const User = require("./models/user");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const uploadMiddleware = multer({ dest: "uploads/" });
const fs = require("fs");
require("dotenv").config();

app.use("/uploads", express.static(__dirname + "/uploads"));
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>App Status</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          background-color: #f0f0f0;
        }
        .container {
          text-align: center;
          padding: 20px;
          background-color: #ffffff;
          border-radius: 10px;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        h1 {
          font-size: 2.5rem;
          color: #333333;
        }
        p {
          font-size: 1.2rem;
          color: #666666;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>App Running</h1>
        <p>Server is running smoothly on port 3001.</p>
      </div>
    </body>
    </html>
  `);
});

function authenticateToken(req, res, next) {
  const { token } = req.cookies;

  if (!token) {
    return res
      .status(401)
      .json({ message: "Unauthorized access, token required" });
  }

  jwt.verify(token, secret, (err, userInfo) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }

    req.user = userInfo; // Save user info for future use in the request
    next(); // Proceed to the next middleware or route handler
  });
}

const Post = require("./models/post");

const url = process.env.URL;
const secret = process.env.SECRET;
const username = process.env.USER;
const password = process.env.PASS;
// app.use(cors({ credentials: true, origin: 'https://blog-mern-xi.vercel.app' }));
const corsOptions = {
  credentials: true,
  origin: url,
};

app.options("*", cors(corsOptions));
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

mongoose.connect(
  `mongodb+srv://${username}:${password}@cluster0.7no7s.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`
);

app.post("/register", authenticateToken, async (req, res) => {
  const { username, password } = req.body;
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(password, salt);
  try {
    const UserDoc = await User.create({ username, password: hashedPassword });
    res.json(UserDoc);
  } catch (e) {
    handleError(res, e, "An error occurred while registering a user");
  }
});

app.post("/login", authenticateToken, async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.findOne({ username });
    if (!userDoc) {
      res.status(400).json("User not found");
      return;
    }
    const passOK = bcrypt.compareSync(password, userDoc.password);

    if (passOK) {
      jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
        if (err) {
          handleError(res, err, "An error occurred while generating a token");
        } else {
          res.cookie("token", token).json({
            id: userDoc._id,
            username,
          });
        }
      });
    } else {
      res.status(400).json("Wrong credentials");
    }
  } catch (error) {
    handleError(res, error, "An error occurred while logging in");
  }
});

app.get("/profile", authenticateToken, (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, (err, info) => {
    if (err) {
      handleError(res, err, "An error occurred while verifying the token");
    } else {
      res.json(info);
    }
  });
});

app.post("/logout", authenticateToken, (req, res) => {
  res.cookie("token", "").json("ok");
});

const UserModel = require("./models/user");

app.get("/users", authenticateToken, async (req, res) => {
  try {
    const users = await UserModel.find();
    res.json(users);
  } catch (error) {
    handleError(res, error, "An error occurred while fetching users");
  }
});

app.post(
  "/post",
  authenticateToken,
  uploadMiddleware.single("file"),
  async (req, res) => {
    try {
      const { originalname, path } = req.file;
      const parts = originalname.split(".");
      const ext = parts[parts.length - 1];
      const newPath = path + "." + ext;
      fs.renameSync(path, newPath);

      const { token } = req.cookies;
      jwt.verify(token, secret, {}, async (err, info) => {
        if (err) {
          handleError(res, err, "Authentication error");
        } else {
          const { title, summary, content } = req.body;

          // Check if the user is Houssam (adjust the condition as needed)
          if (info.username === "Houssam") {
            try {
              const postDoc = await Post.create({
                title,
                summary,
                content,
                cover: newPath,
                author: info.id,
              });
              res.json({ postDoc });
            } catch (createError) {
              handleError(
                res,
                createError,
                "An error occurred while creating the post"
              );
            }
          } else {
            res
              .status(403)
              .json("Permission denied. Only Houssam can create a post.");
          }
        }
      });
    } catch (fileError) {
      handleError(
        res,
        fileError,
        "An error occurred while processing the file"
      );
    }
  }
);

app.put(
  "/post",
  authenticateToken,
  uploadMiddleware.single("file"),
  async (req, res) => {
    try {
      let newPath = null;
      if (req.file) {
        const { originalname, path } = req.file;
        const parts = originalname.split(".");
        const ext = parts[parts.length - 1];
        newPath = path + "." + ext;
        fs.renameSync(path, newPath);
      }

      const { token } = req.cookies;
      jwt.verify(token, secret, {}, async (err, info) => {
        if (err) {
          handleError(res, err, "Authentication error");
        } else {
          const { id, title, summary, content } = req.body;
          const postDoc = await Post.findById(id);

          if (!postDoc) {
            res.status(404).json({ error: "Post not found" });
            return;
          }

          const isAuthor =
            JSON.stringify(postDoc.author) === JSON.stringify(info.id);

          if (!isAuthor) {
            res.status(403).json("You are not the author");
            return;
          }

          try {
            const updatedPost = await Post.findByIdAndUpdate(
              id,
              {
                title,
                summary,
                content,
                cover: newPath ? newPath : postDoc.cover,
              },
              { new: true }
            );
            res.json(updatedPost);
          } catch (updateError) {
            handleError(
              res,
              updateError,
              "An error occurred while updating the post"
            );
          }
        }
      });
    } catch (fileError) {
      handleError(
        res,
        fileError,
        "An error occurred while processing the file"
      );
    }
  }
);

app.delete("/post/:id", authenticateToken, async (req, res) => {
  const postId = req.params.id;

  // Verify the user's token
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, userInfo) => {
    if (err) {
      return handleError(res, err, "Authentication error");
    }

    try {
      // Use findByIdAndDelete to find and delete the post
      const postDoc = await Post.findByIdAndDelete(postId);

      if (!postDoc) {
        return res.status(404).json({ error: "Post not found" });
      }

      if (postDoc.author.toString() !== userInfo.id) {
        return res
          .status(403)
          .json("Permission denied. You are not the author of this post.");
      }

      return res.json({ message: "Post deleted successfully" });
    } catch (error) {
      return handleError(
        res,
        error,
        "An error occurred while deleting the post"
      );
    }
  });
});

app.get("/post", authenticateToken, async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(posts);
  } catch (error) {
    handleError(res, error, "An error occurred while fetching posts");
  }
});

app.get("/post/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const postDoc = await Post.findById(id).populate("author", ["username"]);
    if (!postDoc) {
      res.status(404).json({ error: "Post not found" });
    } else {
      res.json(postDoc);
    }
  } catch (error) {
    handleError(res, error, "An error occurred while fetching the post");
  }
});

app.listen(3001, () => {
  console.log("Server Running On Port 3001!");
});
