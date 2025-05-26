// routs/posts.js

const express = require("express");
const mongoose = require("mongoose");
const Post = require("../models/post");
const Comment = require("../models/comment");
const Reaction = require("../models/reaction");
const { authenticateToken } = require("../middleware/auth");
const { upload, cloudinary } = require("../config/cloudinary");
const { handleError } = require("../middleware/errorHandler");

const router = express.Router();

// Middleware for cascading post deletion
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

// Create post
router.post("/post", authenticateToken, upload.single("file"), async (req, res) => {
  try {
    const { title, summary, content } = req.body;
    
    if (!title || !summary || !content) {
      return res.status(400).json({ 
        message: "Title, summary, and content are required" 
      });
    }

    if (!req.file) {
      return res.status(400).json({ 
        message: "Cover image is required" 
      });
    }

    const postDoc = await Post.create({
      title,
      summary,
      content,
      cover: req.file.path, // Store Cloudinary URL
      coverId: req.file.filename, // Store Cloudinary Public ID for deletion
      author: req.user.id,
    });

    const populatedPost = await Post.findById(postDoc._id).populate("author", ["username"]);
    res.status(201).json(populatedPost);
  } catch (error) {
    console.error("Create post error:", error);
    handleError(res, error, "Failed to create post");
  }
});

// Get all posts
router.get("/posts", async (req, res) => {
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

      // Delete the posts and their images
      for (const post of postsToDelete.filter(p => !p.author)) {
        if (post.coverId) {
          try {
            await cloudinary.uploader.destroy(post.coverId);
          } catch (err) {
            console.error(`Failed to delete image ${post.coverId}:`, err);
          }
        }
      }

      await Post.deleteMany({ _id: { $in: postIdsToDelete } });
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

// Get single post
router.get("/post/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate("author", ["username"]);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.json(post);
  } catch (error) {
    handleError(res, error, "Failed to fetch post");
  }
});

// Update post
router.put("/post/:id", authenticateToken, upload.single("file"), async (req, res) => {
  try {
    const { title, summary, content } = req.body;
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if user is authorized to edit this post
    if (post.author.toString() !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ message: "Not authorized to edit this post" });
    }

    // If a new image is provided, delete the old one from Cloudinary
    if (req.file) {
      if (post.coverId) {
        try {
          await cloudinary.uploader.destroy(post.coverId);
        } catch (err) {
          console.error("Failed to delete old image:", err);
        }
      }
      post.cover = req.file.path;
      post.coverId = req.file.filename;
    }

    post.title = title || post.title;
    post.summary = summary || post.summary;
    post.content = content || post.content;

    await post.save();
    const updatedPost = await Post.findById(post._id).populate("author", ["username"]);
    res.json(updatedPost);
  } catch (error) {
    console.error("Update post error:", error);
    handleError(res, error, "Failed to update post");
  }
});

// Delete post
router.delete("/post/:id", authenticateToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if the logged-in user is the author of the post or admin
    if (post.author.toString() !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ 
        message: "You are not authorized to delete this post" 
      });
    }

    await cascadeDeletePost(req.params.id);
    res.json({
      message: "Post and associated content deleted successfully",
    });
  } catch (error) {
    handleError(res, error, "Failed to delete post and associated content");
  }
});

// Get post comments
router.get("/post/:id/comments", async (req, res) => {
  try {
    // First find comments where the referenced author doesn't exist anymore
    const commentsToDelete = await Comment.find({
      post: req.params.id,
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

// Create comment
router.post("/post/:id/comment", authenticateToken, async (req, res) => {
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

// Get post reactions
router.get("/post/:id/reactions", async (req, res) => {
  try {
    // First find reactions where the referenced user doesn't exist anymore
    const reactionsToDelete = await Reaction.find({
      post: req.params.id,
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

// Add/remove reaction
router.post("/post/:id/addreaction", authenticateToken, async (req, res) => {
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

// Get reaction users
router.get("/post/:id/reactions/users/:type", async (req, res) => {
  try {
    const { id, type } = req.params;

    if (!["like", "dislike", "love", "fire"].includes(type)) {
      return res.status(400).json({ message: "Invalid reaction type" });
    }

    const reactions = await Reaction.find({
      post: id,
      type: type.replace("s", ""), // Remove 's' from plural form
    }).populate("user", "username");

    const users = reactions
      .filter(reaction => reaction.user) // Filter out reactions with null users
      .map((reaction) => ({
        id: reaction.user._id,
        username: reaction.user.username,
      }));

    res.json(users);
  } catch (error) {
    handleError(res, error, "Failed to fetch reaction users");
  }
});

module.exports = router;