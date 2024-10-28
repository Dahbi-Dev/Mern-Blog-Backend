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


// Middleware setup
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(cors({ credentials: true, origin: process.env.URL }));
app.use(express.json());
app.use(cookieParser());
// Enhanced error handling middleware
// app.use(async (err, req, res, next) => {
//   console.error(err.stack);

//   if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") {
//     return res.status(401).json({
//       error: "AUTH_ERROR",
//       message: "Session expired. Please login again.",
//     });
//   }

//   if (err.name === "ValidationError") {
//     return res.status(400).json({
//       error: "VALIDATION_ERROR",
//       message: err.message,
//     });
//   }

//   res.status(500).json({
//     error: "SERVER_ERROR",
//     message: "An unexpected error occurred",
//   });
// });

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI);

// Error handling function
function handleError(res, error, message) {
  console.error(error);
  res.status(500).json({ message, error: error.message });
}


// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const { token } = req.cookies;
  if (!token) {
    return res.status(401).json({
      error: "AUTH_REQUIRED",
      message: "Authentication required",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET);

    // Check if user still exists in database
    const userExists = await User.findById(decoded.id);
    if (!userExists) {
      res.clearCookie("token");
      return res.status(401).json({
        error: "USER_NOT_FOUND",
        message: "User no longer exists",
      });
    }

    req.user = {
      ...decoded,
      isAdmin: userExists.isAdmin,
    };
    next();
  } catch (err) {
    res.clearCookie("token");
    return res.status(403).json({
      error: "INVALID_TOKEN",
      message: "Invalid or expired token",
    });
  }
};

const admin = process.env.ADMIN_EMAIL; //email admin

// Admin middleware (for Houssam-only routes)
const isAdmin = (req, res, next) => {
  if (req.user.username !== admin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

// Middleware for cascading post deletion
// Middleware for cascading post deletion
const cascadeDeletePost = async (postId) => {
  try {
    const post = await Post.findById(postId);
    if (!post) return;

    // Delete associated image if exists
    if (post.cover) {
      fs.unlink(post.cover, (err) => {
        if (err) console.error(`Error deleting image for post ${postId}:`, err);
      });
    }

    // Delete all associated comments and reactions
    await Promise.all([
      Comment.deleteMany({ post: postId }),
      Reaction.deleteMany({ post: postId }),
    ]);

    // Delete the post itself
    await Post.findByIdAndDelete(postId);
  } catch (error) {
    console.error("Error in cascadeDeletePost:", error);
    throw error;
  }
};



// Home route
app.get("/", (req, res) => {
  res.send(`
    <div style="text-align: center; padding: 20px;">
      <h1>Server Running</h1>
      <p>Server is running on port ${process.env.PORT || 3001}</p>
    </div>
  `);
});

// Auth routes
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(400).json({ message: "Username already exists" });
      }
      if (existingUser.email === email) {
        return res.status(400).json({ message: "Email already registered" });
      }
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const userDoc = await User.create({
      username,
      email,
      password: hashedPassword,
      isAdmin: true, // Check if user is admin based on email
    });

    res.json({ message: "Registration successful", id: userDoc._id });
  } catch (e) {
    handleError(res, e, "Registration failed");
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const userDoc = await User.findOne({ email });
    if (!userDoc) {
      return res.status(400).json({ message: "User not found" });
    }

    const passOK = bcrypt.compareSync(password, userDoc.password);
    if (!passOK) {
      return res.status(400).json({ message: "Invalid password" });
    }

    jwt.sign(
      {
        email,
        id: userDoc._id,
        username: userDoc.username,
        isAdmin: userDoc.isAdmin,
      },
      process.env.SECRET,
      { expiresIn: "7d" },
      (err, token) => {
        if (err) throw err;
        res
          .cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
          })
          .json({
            id: userDoc._id,
            username: userDoc.username,
            email: userDoc.email,
            isAdmin: userDoc.isAdmin,
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


// Generate and send reset code
app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate a 6-digit code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashCode = bcrypt.hashSync(resetCode, 10);
    
    // Set token expiration to 15 minutes from now
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + 15);

    // Save the hashed code and expiration
    user.resetPasswordToken = hashCode;
    user.resetPasswordExpires = expirationTime;
    await user.save();

    // Return the code (in production, this would be sent via email)
    res.json({ 
      message: "Reset code generated successfully",
      resetCode, // Remove this in production
      expiresIn: "15 minutes"
    });
  } catch (error) {
    handleError(res, error, "Failed to generate reset code");
  }
});

// Verify reset code and update password
app.post("/reset-password", async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;
    const user = await User.findOne({ 
      email,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ 
        message: "Invalid or expired reset code" 
      });
    }

    // Verify the reset code
    const isValidCode = bcrypt.compareSync(resetCode, user.resetPasswordToken);
    if (!isValidCode) {
      return res.status(400).json({ 
        message: "Invalid reset code" 
      });
    }

    // Update password and clear reset fields
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    handleError(res, error, "Failed to reset password");
  }
});

// User routes
app.get("/profile", authenticateToken, (req, res) => {
  res.json(req.user);
});

// Delete a post by ID with proper authorization
app.delete("/post/:id", authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Since isAdmin is already checked, we can directly delete
    await cascadeDeletePost(req.params.id); // Cascade delete post and its associated content
    res.json({
      message: "Post and associated content deleted successfully",
    });
  } catch (error) {
    handleError(res, error, "Failed to delete post and associated content");
  }
});

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
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

// Post routes
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
// Admin router
const adminRouter = express.Router();

// Delete any post (admin-only)
adminRouter.delete("/post/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Since isAdmin is already checked, we can directly delete
    await cascadeDeletePost(req.params.id); // Cascade delete post and its associated content
    res.json({
      message: "Post and associated content deleted successfully",
    });
  } catch (error) {
    handleError(res, error, "Failed to delete post and associated content");
  }
});

// Edit any post (admin-only)
adminRouter.put(
  "/post/:id",
  authenticateToken,
  isAdmin,
  upload.single("file"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, summary, content } = req.body;

      const post = await Post.findById(id);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      const updateData = { title, summary, content };

      if (req.file) {
        updateData.cover = req.file.path;
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

// Mount the admin router
app.use("/admin", adminRouter);

app.delete("/post/:id", authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if the logged-in user is the author of the post
    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ message: "You are not authorized to delete this post" });
    }

    await cascadeDeletePost(req.params.id);
    res.json({
      message: "Post and associated content deleted successfully",
    });
  } catch (error) {
    handleError(res, error, "Failed to delete post and associated content");
  }
});

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

      const updateData = { title, summary, content };

      if (req.file) {
        updateData.cover = req.file.path;
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

app.get("/posts", async (req, res) => {
  try {
    // First find posts where the referenced author doesn't exist anymore
    const postsToDelete = await Post.find().populate("author").lean();

    // Get the IDs of posts where author populated as null
    const postIdsToDelete = postsToDelete
      .filter((post) => !post.author)
      .map((post) => post._id);

    // Delete posts from deleted users
    if (postIdsToDelete.length > 0) {
      // Delete associated reactions
      await Reaction.deleteMany({ post: { $in: postIdsToDelete } });

      // Delete associated comments
      await Comment.deleteMany({ post: { $in: postIdsToDelete } });

      // Delete the posts
      await Post.deleteMany({ _id: { $in: postIdsToDelete } });

      // If files exist, you might want to delete the cover images too
      postsToDelete
        .filter((post) => !post.author && post.cover)
        .forEach((post) => {
          try {
            fs.unlinkSync(post.cover);
          } catch (err) {
            console.error(`Failed to delete file ${post.cover}:`, err);
          }
        });
    }

    // Fetch remaining posts with valid authors
    const posts = await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 });

    res.json(posts);
  } catch (error) {
    handleError(res, error, "Failed to fetch posts");
  }
});

// Helper function for error handling
function handleError(res, error, message) {
  console.error(error);
  res.status(500).json({ error: message });
}

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

app.get("/post/:id/comments", async (req, res) => {
  try {
    // First find comments where the referenced author doesn't exist anymore
    const commentsToDelete = await Comment.find({
      author: { $exists: true },
    }).populate("author");

    // Get the IDs of comments where author populated as null
    const commentIdsToDelete = commentsToDelete
      .filter((comment) => !comment.author)
      .map((comment) => comment._id);

    // Delete those comments
    if (commentIdsToDelete.length > 0) {
      await Comment.deleteMany({ _id: { $in: commentIdsToDelete } });
    }

    // Fetch remaining comments for the post
    const comments = await Comment.find({
      post: req.params.id,
    })
      .populate("author", "username")
      .sort({ createdAt: -1 });

    res.json(comments);
  } catch (error) {
    handleError(res, error, "Failed to fetch comments");
  }
});

// Helper function for error handling
function handleError(res, error, message) {
  console.error(error);
  res.status(500).json({ error: message });
}

// Other comment routes (e.g., posting a comment)
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
    res.status(201).json(populatedComment);
  } catch (error) {
    handleError(res, error, "Failed to create comment");
  }
});

app.get("/post/:id/reactions", async (req, res) => {
  try {
    // First find reactions where the referenced user doesn't exist anymore
    const reactionsToDelete = await Reaction.find({
      user: { $exists: true },
    }).populate("user");

    // Get the IDs of reactions where user populated as null
    const reactionIdsToDelete = reactionsToDelete
      .filter((reaction) => !reaction.user)
      .map((reaction) => reaction._id);

    // Delete reactions from deleted users
    if (reactionIdsToDelete.length > 0) {
      await Reaction.deleteMany({ _id: { $in: reactionIdsToDelete } });
    }

    // Now get counts of remaining valid reactions
    const counts = await Reaction.aggregate([
      {
        $match: {
          post: new mongoose.Types.ObjectId(req.params.id),
        },
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

// Helper function for error handling
function handleError(res, error, message) {
  console.error(error);
  res.status(500).json({ error: message });
}

app.post("/post/:id/addreaction", authenticateToken, async (req, res) => {
  try {
    const { type } = req.body;
    const { id } = req.params;

    if (!["like", "dislike", "love", "fire"].includes(type)) {
      return res.status(400).json({ message: "Invalid reaction type" });
    }

    const existingReaction = await Reaction.findOne({
      post: new mongoose.Types.ObjectId(id),
      user: new mongoose.Types.ObjectId(req.user.id),
      type,
    });

    if (existingReaction) {
      await Reaction.deleteOne({ _id: existingReaction._id });
      res.json({ message: "Reaction removed successfully" });
    } else {
      await Reaction.deleteOne({
        post: new mongoose.Types.ObjectId(id),
        user: new mongoose.Types.ObjectId(req.user.id),
      });

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
// Reaction users route
app.get(
  "/post/:id/reactions/users/:type",
  authenticateToken,
  async (req, res) => {
    try {
      const { id, type } = req.params;

      if (!["like", "dislike", "love", "fire"].includes(type)) {
        return res.status(400).json({ message: "Invalid reaction type" });
      }

      const reactions = await Reaction.find({
        post: id,
        type: type.replace("s", ""), // Remove 's' from plural form
      }).populate("user", "username");

      const users = reactions.map((reaction) => ({
        id: reaction.user._id,
        username: reaction.user.username,
      }));

      res.json(users);
    } catch (error) {
      handleError(res, error, "Failed to fetch reaction users");
    }
  }
);

//  Get all users (admin only)
app.get("/admin/users", authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await User.find(
      {},
      {
        password: 0,
        resetPasswordToken: 0,
        resetPasswordExpires: 0,
      }
    );
    res.json(users);
  } catch (error) {
    handleError(res, error, "Failed to fetch users");
  }
});

// Delete user (admin only)
app.delete("/admin/users/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // Don't allow admin to delete themselves
    if (userId === req.user.id) {
      return res
        .status(400)
        .json({ message: "Cannot delete your own admin account" });
    }

    // Find all posts by this user
    const userPosts = await Post.find({ author: userId });

    // Delete all posts and their associated content
    for (const post of userPosts) {
      await cascadeDeletePost(post._id);
    }

    // Delete all comments by this user on other posts
    await Comment.deleteMany({ author: userId });

    // Delete all reactions by this user
    await Reaction.deleteMany({ user: userId });

    // Finally delete the user
    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "User and all associated content deleted successfully",
    });
  } catch (error) {
    handleError(res, error, "Failed to delete user");
  }
});

// Get user stats (admin only)
app.get(
  "/admin/users/:id/stats",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const userId = req.params.id;

      const stats = {
        postsCount: await Post.countDocuments({ author: userId }),
        commentsCount: await Comment.countDocuments({ author: userId }),
        reactionsCount: await Reaction.countDocuments({ user: userId }),
      };

      res.json(stats);
    } catch (error) {
      handleError(res, error, "Failed to fetch user stats");
    }
  }
);

// Update user role (admin only)
app.patch(
  "/admin/users/:id/role",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const userId = req.params.id;

      // Don't allow admin to change their own role
      if (userId === req.user.id) {
        return res.status(400).json({
          message: "Cannot modify your own admin status",
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Toggle isAdmin status
      user.isAdmin = !user.isAdmin;
      await user.save();

      res.json({
        message: `User role updated successfully. New role: ${
          user.isAdmin ? "Admin" : "User"
        }`,
        isAdmin: user.isAdmin,
      });
    } catch (error) {
      handleError(res, error, "Failed to update user role");
    }
  }
);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
