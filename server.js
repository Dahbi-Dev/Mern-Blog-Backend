const express = require('express');
const cors = require('cors');
const app = express();
const User = require('./models/user');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const uploadMiddleware = multer({ dest: 'uploads/' });
const fs = require('fs');

app.use('/uploads', express.static(__dirname + '/uploads'));


const Post = require('./models/post');

app.use(cors({ credentials: true, origin: 'http://localhost:3000' }));
app.use(express.json());
app.use(cookieParser());

const secret = "34kdjflksjfsldjf34lkjkdl";

  
  mongoose.connect("mongodb+srv://hossamdahbi626:eH8o0UNp6hUQrnyY@cluster0.r1s0spf.mongodb.net/test?retryWrites=true&w=majority");

// Error handling function to send error responses and log errors
const handleError = (res, error, message) => {
  console.error(error);
  res.status(500).json({ error: message });
};

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(password, salt);
  try {
    const UserDoc = await User.create({ username, password: hashedPassword });
    res.json(UserDoc);
  } catch (e) {
    handleError(res, e, 'An error occurred while registering a user');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.findOne({ username });
    if (!userDoc) {
      res.status(400).json('User not found');
      return;
    }
    const passOK = bcrypt.compareSync(password, userDoc.password);

    if (passOK) {
      jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
        if (err) {
          handleError(res, err, 'An error occurred while generating a token');
        } else {
          res.cookie('token', token).json({
            id: userDoc._id,
            username,
          });
        }
      });
    } else {
      res.status(400).json('Wrong credentials');
    }
  } catch (error) {
    handleError(res, error, 'An error occurred while logging in');
  }
});

app.get('/profile', (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, (err, info) => {
    if (err) {
      handleError(res, err, 'An error occurred while verifying the token');
    } else {
      res.json(info);
    }
  });
});

app.post('/logout', (req, res) => {
  res.cookie('token', '').json('ok');
});

const UserModel = require('./models/User');

app.get('/users', async (req, res) => {
  try {
    const users = await UserModel.find();
    res.json(users);
  } catch (error) {
    handleError(res, error, 'An error occurred while fetching users');
  }
});




app.post('/post', uploadMiddleware.single('file'), async (req, res) => {
  try {
    const { originalname, path } = req.file;
    const parts = originalname.split('.');
    const ext = parts[parts.length - 1];
    const newPath = path + '.' + ext;
    fs.renameSync(path, newPath);

    const { token } = req.cookies;
    jwt.verify(token, secret, {}, async (err, info) => {
      if (err) {
        handleError(res, err, 'Authentication error');
      } else {
        const { title, summary, content } = req.body;

        // Check if the user is Houssam (adjust the condition as needed)
        if (info.username === 'Houssam') {
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
            handleError(res, createError, 'An error occurred while creating the post');
          }
        } else {
          res.status(403).json('Permission denied. Only Houssam can create a post.');
        }
      }
    });
  } catch (fileError) {
    handleError(res, fileError, 'An error occurred while processing the file');
  }
});

app.put('/post', uploadMiddleware.single('file'), async (req, res) => {
  try {
    let newPath = null;
    if (req.file) {
      const { originalname, path } = req.file;
      const parts = originalname.split('.');
      const ext = parts[parts.length - 1];
      newPath = path + '.' + ext;
      fs.renameSync(path, newPath);
    }

    const { token } = req.cookies;
    jwt.verify(token, secret, {}, async (err, info) => {
      if (err) {
        handleError(res, err, 'Authentication error');
      } else {
        const { id, title, summary, content } = req.body;
        const postDoc = await Post.findById(id);

        if (!postDoc) {
          res.status(404).json({ error: 'Post not found' });
          return;
        }

        const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);

        if (!isAuthor) {
          res.status(403).json('You are not the author');
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
          handleError(res, updateError, 'An error occurred while updating the post');
        }
      }
    });
  } catch (fileError) {
    handleError(res, fileError, 'An error occurred while processing the file');
  }
});


app.delete('/post/:id', async (req, res) => {
  const postId = req.params.id;

  // Verify the user's token
  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, userInfo) => {
    if (err) {
      return handleError(res, err, 'Authentication error');
    }

    try {
      // Use findByIdAndDelete to find and delete the post
      const postDoc = await Post.findByIdAndDelete(postId);

      if (!postDoc) {
        return res.status(404).json({ error: 'Post not found' });
      }

      if (postDoc.author.toString() !== userInfo.id) {
        return res.status(403).json('Permission denied. You are not the author of this post.');
      }

      return res.json({ message: 'Post deleted successfully' });
    } catch (error) {
      return handleError(res, error, 'An error occurred while deleting the post');
    }
  });
});



app.get('/post', async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('author', ['username'])
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(posts);
  } catch (error) {
    handleError(res, error, 'An error occurred while fetching posts');
  }
});

app.get('/post/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const postDoc = await Post.findById(id).populate('author', ['username']);
    if (!postDoc) {
      res.status(404).json({ error: 'Post not found' });
    } else {
      res.json(postDoc);
    }
  } catch (error) {
    handleError(res, error, 'An error occurred while fetching the post');
  }
});




const port = 3001 || process.env.PORT
if(port) {
  
app.listen(port, () => {
  console.log('Server Running On Port 3001!');
});
}

module.exports = app
