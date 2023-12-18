const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();
require('dotenv').config();

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
});

const User = mongoose.model('User', userSchema);

const postSchema = new mongoose.Schema({
  title: String,
  link: String,
  category: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  likes: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
  ],
  dislikes: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
  ],
  timestamp: {
    type: Date,
    default: Date.now,
  },
  comments: [
    {
      text: String,
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
  ],
  image: {
    data: Buffer,
    contentType: String,
  },
});

const Post = mongoose.model('Post', postSchema);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

function timeAgo(timestamp) {
  const now = new Date();
  const postedTime = new Date(timestamp);
  const timeDiff = now - postedTime;
  const seconds = Math.floor(timeDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return days + ' day(s) ago';
  } else if (hours > 0) {
    return hours + ' hour(s) ago';
  } else if (minutes > 0) {
    return minutes + ' minute(s) ago';
  } else {
    return 'Just now';
  }
}

app.get('/about-us', (req, res) => {
  res.render('about-us', { user: req.session.user });
});

app.get('/contact-us', (req, res) => {
  res.render('contact-us', { user: req.session.user });
});

app.get('/privacy-policy', (req, res) => {
  res.render('privacy-policy', { user: req.session.user });
});

// Middleware to check if the user is logged in
const isLoggedIn = (req, res, next) => {
  if (req.session.user) {
    return next();
  } else {
    res.redirect('/login');
  }
};

app.get('/login', (req, res) => {
  res.render('login-register', { error: null });
});

app.get('/register', (req, res) => {
  res.render('login-register', { error: null });
});

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.render('login-register', { error: 'Email already registered' });
    }

    const newUser = new User({
      username,
      email,
      password, // Replace with your registration logic (e.g., hashing password)
    });

    await newUser.save();
    console.log('User registered successfully.');
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .render('dashboard', { error: 'Internal server error' });
  }
});

app.get('/login', (req, res) => {
  res.render('login-register', { error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.render('login-register', { error: 'Invalid email or password' });
    }

    // Replace with your login logic (e.g., password comparison)
    if (password !== user.password) {
      return res.render('login-register', { error: 'Invalid email or password' });
    }

    req.session.user = user;

    res.redirect('/');
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .render('login-register', { error: 'Internal server error' });
  }
});

app.get('/', async (req, res) => {
  const { search, category } = req.query;
  const filter = {};

  if (search) {
    filter.title = { $regex: new RegExp(search, 'i') };
  }

  if (category && category !== 'All') {
    filter.category = category;
  }

  try {
    const posts = await Post.find(filter)
      .populate('userId', 'username')
      .populate('comments.userId', 'username')
      .sort({ timestamp: -1 });

    const categorizedPosts = {};

    posts.forEach((post) => {
      if (!categorizedPosts[post.category]) {
        categorizedPosts[post.category] = [];
      }
      categorizedPosts[post.category].push(post);
    });

    res.render('dashboard', {
      user: req.session.user,
      posts: categorizedPosts,
      error: null,
      timeAgo,
      search,
      selectedCategory: category || 'All',
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('dashboard', {
      user: req.session.user,
      posts: {},
      error: 'Error fetching posts',
      timeAgo,
      search: '',
      selectedCategory: 'All',
    });
  }
});

app.get('/search', async (req, res) => {
  const { search } = req.query;

  try {
    const results = await Post.find({ title: { $regex: search, $options: 'i' } });

    res.render('search-results', { results });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
    }
    res.redirect('/login');
  });
});
app.post('/post-link', upload.single('image'), isLoggedIn, async (req, res) => {
  const { title, link, category } = req.body;
  const userId = req.session.user._id;
  const image = req.file;

  try {
    const newPost = new Post({
      title,
      link,
      category,
      userId,
      image: image ? { data: image.buffer, contentType: image.mimetype } : undefined,
    });

    await newPost.save();
    console.log('Post created successfully.');
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.status(500).render('dashboard', { error: 'Internal server error' });
  }
});

app.post('/post-description', upload.single('image'), isLoggedIn, async (req, res) => {
  const { title, link, category } = req.body;
  const userId = req.session.user._id;
  const image = req.file;

  try {
    const newPost = new Post({
      title,
      link,
      category,
      userId,
      image: image ? { data: image.buffer, contentType: image.mimetype } : undefined,
    });

    await newPost.save();
    console.log('Post created successfully.');
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.status(500).render('dashboard', { error: 'Internal server error' });
  }
});

app.get('/like-post/:postId', isLoggedIn, async (req, res) => {
  const { postId } = req.params;
  const userId = req.session.user._id;

  try {
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).send('Post not found');
    }

    const hasLiked = post.likes.some((like) => like.userId.equals(userId));

    if (hasLiked) {
      // User already liked the post, unlike it
      post.likes = post.likes.filter((like) => !like.userId.equals(userId));
    } else {
      // User hasn't liked the post, add like
      post.likes.push({ userId });
    }

    await post.save();
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

app.get('/dislike-post/:postId', isLoggedIn, async (req, res) => {
  const { postId } = req.params;
  const userId = req.session.user._id;

  try {
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).send('Post not found');
    }

    const hasDisliked = post.dislikes.some((dislike) => dislike.userId.equals(userId));

    if (hasDisliked) {
      // User already disliked the post, undislike it
      post.dislikes = post.dislikes.filter((dislike) => !dislike.userId.equals(userId));
    } else {
      // User hasn't disliked the post, add dislike
      post.dislikes.push({ userId });
    }

    await post.save();
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

app.post('/comment/:postId', isLoggedIn, async (req, res) => {
  const { postId } = req.params;
  const { text } = req.body;
  const userId = req.session.user._id;

  try {
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).send('Post not found');
    }

    const newComment = {
      text,
      userId,
    };

    post.comments.push(newComment);
    await post.save();
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
