// routes/admin.js

const express = require("express");
const User = require("../models/user");
const Post = require("../models/post");
const Comment = require("../models/comment");
const Reaction = require("../models/reaction");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const { upload, cloudinary } = require("../config/cloudinary");
const { handleError } = require("../middleware/errorHandler");

const router = express.Router();

// Middleware for cascading post deletion (same as in posts.js)
const cascadeDeletePost = async (postId) => {
  try {
    const post = await Post.findById(postId);
    if (!post) {
      console.error("Post not found");
      return;
    }

    // Check if coverId exists and attempt deletion
    if (post.coverId) {
      try {
        const response = await cloudinary.uploader.destroy(post.coverId);
        console.log("Cloudinary deletion response:", response);
      } catch (cloudinaryError) {
        console.error("Failed to delete from Cloudinary:", cloudinaryError);
      }
    } else {
      console.log("No coverId found for this post; skipping Cloudinary deletion.");
    }

    // Delete associated comments and reactions
    await Promise.all([
      Comment.deleteMany({ post: postId }),
      Reaction.deleteMany({ post: postId }),
    ]);

    await Post.findByIdAndDelete(postId);
    console.log("Post and related data deleted successfully.");
  } catch (error) {
    console.error("Error in cascadeDeletePost:", error);
    throw error;
  }
};

// Delete any post (admin-only)
router.delete("/post/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    await cascadeDeletePost(req.params.id);
    res.json({
      message: "Post and associated content deleted successfully",
    });
  } catch (error) {
    handleError(res, error, "Failed to delete post and associated content");
  }
});

// Edit any post (admin-only)
router.put("/post/:id", authenticateToken, isAdmin, upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, summary, content } = req.body;

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const updateData = { title, summary, content };

    if (req.file) {
      // Delete old image if exists
      if (post.coverId) {
        try {
          await cloudinary.uploader.destroy(post.coverId);
        } catch (err) {
          console.error("Failed to delete old image:", err);
        }
      }
      updateData.cover = req.file.path;
      updateData.coverId = req.file.filename;
    }

    const updatedPost = await Post.findByIdAndUpdate(id, updateData, {
      new: true,
    }).populate("author", ["username"]);

    res.json(updatedPost);
  } catch (error) {
    handleError(res, error, "Failed to update post");
  }
});

// Get all users (admin only)
router.get("/users", authenticateToken, isAdmin, async (req, res) => {
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
router.delete("/users/:id", authenticateToken, isAdmin, async (req, res) => {
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
router.get("/users/:id/stats", authenticateToken, isAdmin, async (req, res) => {
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
});

// Update user role (admin only)
router.patch("/users/:id/role", authenticateToken, isAdmin, async (req, res) => {
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
});

module.exports = router;