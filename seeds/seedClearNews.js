// seeds/seedDeleteNews.js
const mongoose = require("mongoose");
const dotenv = require("dotenv");

// Load environment variables from .env file (if used)
dotenv.config();

// Import your News model
const News = require("../models/News");

// Connect to MongoDB using the MONGO_URI environment variable
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB.");
    // Delete all news posts
    return News.deleteMany({});
  })
  .then((result) => {
    console.log("Deleted all news posts:", result);
    // Close the connection
    return mongoose.connection.close();
  })
  .then(() => {
    console.log("Database connection closed.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
