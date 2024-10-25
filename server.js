const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const User = require("./models/user");
const Post = require("./models/post");
const Comment = require("./models/comment");
const Reaction = require("./models/reaction");

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const { token } = req.cookies;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  jwt.verify(token, process.env.SECRET, {}, (err, info) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = info;
    next();
  });
};

// Admin middleware (for Houssam-only routes)
const isAdmin = (req, res, next) => {
  if (req.user.username !== "Houssam") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// Middleware setup
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(cors({ credentials: true, origin: process.env.URL }));
app.use(express.json());
app.use(cookieParser());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI);

// Error handling function
function handleError(res, error, message) {
  console.error(error);
  res.status(500).json({ message, error: error.message });
}

// Public routes
app.get("/", (req, res) => {
  res.send(`
  
    
      <title>App Status</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f0f0f0; }
        .container { text-align: center; padding: 20px; background-color: #ffffff; border-radius: 10px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); }
        h1 { font-size: 2.5rem; color: #333333; }
        p { font-size: 1.2rem; color: #666666; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>App Running</h1>
        <p>Server is running smoothly on port 3001.</p>
      </div>
    </body>
 
  `);
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    const userDoc = await User.create({ username, password: hashedPassword });
    res.json({ message: "Registration successful", id: userDoc._id });
  } catch (e) {
    handleError(res, e, "Registration failed");
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.findOne({ username });
    if (!userDoc) {
      return res.status(400).json({ message: "User not found" });
    }

    const passOK = bcrypt.compareSync(password, userDoc.password);
    if (!passOK) {
      return res.status(400).json({ message: "Invalid password" });
    }

    jwt.sign(
      { username, id: userDoc._id },
      process.env.SECRET,
      { expiresIn: "1d" },
      (err, token) => {
        if (err) throw err;
        res
          .cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 24 * 60 * 60 * 1000, // 1 day
          })
          .json({
            id: userDoc._id,
            username,
          });
      }
    );
  } catch (error) {
    handleError(res, error, "Login failed");
  }
});

app.post("/logout", authenticateToken, (req, res) => {
  res
    .cookie("token", "", {
      httpOnly: true,
      expires: new Date(0),
    })
    .json({ message: "Logged out successfully" });
});

// Protected routes
app.get("/profile", authenticateToken, (req, res) => {
  res.json(req.user);
});

app.get("/users", authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 });
    res.json(users);
  } catch (error) {
    handleError(res, error, "Failed to fetch users");
  }
});

// Configure multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = fileTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed!"));
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Post routes with authentication
app.post(
  "/post",
  authenticateToken,

  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Image file is required" });
      }

      const { title, summary, content } = req.body;
      const postDoc = await Post.create({
        title,
        summary,
        content,
        cover: req.file.path,
        author: req.user.id,
      });
      res.json(postDoc);
    } catch (error) {
      handleError(res, error, "Failed to create post");
    }
  }
);

app.put(
  "/post/:id",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, summary, content } = req.body;

      const post = await Post.findById(id);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      if (post.author.toString() !== req.user.id) {
        return res
          .status(403)
          .json({ message: "Not authorized to edit this post" });
      }

      const updateData = {
        title,
        summary,
        content,
      };

      if (req.file) {
        updateData.cover = req.file.path;
        // Delete old image
        if (post.cover) {
          fs.unlink(post.cover, (err) => {
            if (err) console.error("Error deleting old image:", err);
          });
        }
      }

      const updatedPost = await Post.findByIdAndUpdate(id, updateData, {
        new: true,
      }).populate("author", ["username"]);

      res.json(updatedPost);
    } catch (error) {
      handleError(res, error, "Failed to update post");
    }
  }
);

app.delete("/post/:id", authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (
      post.author.toString() !== req.user.id &&
      req.user.username !== "Houssam"
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this post" });
    }

    // Delete associated image
    if (post.cover) {
      fs.unlink(post.cover, (err) => {
        if (err) console.error("Error deleting image:", err);
      });
    }

    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: "Post deleted successfully" });
  } catch (error) {
    handleError(res, error, "Failed to delete post");
  }
});

app.get("/posts", async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (error) {
    handleError(res, error, "Failed to fetch posts");
  }
});

app.get("/post/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate("author", [
      "username",
    ]);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.json(post);
  } catch (error) {
    handleError(res, error, "Failed to fetch post");
  }
});
// Reaction endpoints
// GET reactions endpoint
app.get("/post/:id/reactions", async (req, res) => {
  try {
    const counts = await Reaction.aggregate([
      { 
        $match: { 
          post: new mongoose.Types.ObjectId(req.params.id) 
        } 
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ]);

    const results = {
      likes: 0,
      dislikes: 0,
      loves: 0,
      fires: 0,
    };

    counts.forEach(({ _id, count }) => {
      results[_id + "s"] = count;
    });

    res.json(results);
  } catch (error) {
    handleError(res, error, "Failed to fetch reactions");
  }
});

// GET users who reacted endpoint
app.get("/post/:id/reactions/users/:type", async (req, res) => {
  try {
    const { id, type } = req.params;

    // Validate reaction type
    if (!["like", "dislike", "love", "fire"].includes(type)) {
      return res.status(400).json({ message: "Invalid reaction type" });
    }

    const reactions = await Reaction.find({
      post: new mongoose.Types.ObjectId(id),
      type,
    }).populate("user", "username");

    const users = reactions.map((reaction) => reaction.user);
    res.json(users);
  } catch (error) {
    handleError(res, error, "Failed to fetch reaction users");
  }
});

// POST reaction endpoint
app.post("/post/:id/reaction", authenticateToken, async (req, res) => {
  try {
    const { type } = req.body;
    const { id } = req.params;

    // Validate reaction type
    if (!["like", "dislike", "love", "fire"].includes(type)) {
      return res.status(400).json({ message: "Invalid reaction type" });
    }

    // If user already reacted with the same type, remove the reaction
    const existingReaction = await Reaction.findOne({
      post: new mongoose.Types.ObjectId(id),
      user: new mongoose.Types.ObjectId(req.user.id),
      type,
    });

    if (existingReaction) {
      await Reaction.deleteOne({ _id: existingReaction._id });
      res.json({ message: "Reaction removed successfully" });
    } else {
      // Remove any existing reaction of different type
      await Reaction.deleteOne({
        post: new mongoose.Types.ObjectId(id),
        user: new mongoose.Types.ObjectId(req.user.id),
      });

      // Create new reaction
      await Reaction.create({
        post: new mongoose.Types.ObjectId(id),
        user: new mongoose.Types.ObjectId(req.user.id),
        type,
      });

      res.json({ message: "Reaction added successfully" });
    }
  } catch (error) {
    handleError(res, error, "Failed to update reaction");
  }
});

// Comment endpoints
app.get("/post/:id/comments", async (req, res) => {
  try {
    const comments = await Comment.find({ post: req.params.id })
      .populate("author", "username")
      .sort({ createdAt: -1 });
    res.json(comments);
  } catch (error) {
    handleError(res, error, "Failed to fetch comments");
  }
});

app.post("/post/:id/comment", authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    const { id } = req.params;

    if (!content?.trim()) {
      return res.status(400).json({ message: "Comment content is required" });
    }

    const comment = await Comment.create({
      content,
      post: id,
      author: req.user.id,
    });

    const populatedComment = await comment.populate("author", "username");
    res.json(populatedComment);
  } catch (error) {
    handleError(res, error, "Failed to create comment");
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
