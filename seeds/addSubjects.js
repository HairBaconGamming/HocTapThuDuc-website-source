// seeds/addSubjects.js
require('dotenv').config();
const mongoose = require('mongoose');
const Subject = require('../models/Subject'); // adjust the path if necessary

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(async () => {
    console.log("Connected to DB!");

    // Array of subjects to seed
    const subjects = [
      {
        name: "Giáo dục công dân",
        description: "Học làm người, rèn đức, xây quê hương.",
        image: "https://cdn.glitch.global/71030012-56ea-4d26-a426-e0099201df1c/1693500174-img-3373-5206-width645height423.jpg?v=1744295441318"  // Replace with your image URL or local path if needed
      },
    ];

    // Insert subjects into the database
    for (const subj of subjects) {
      try {
        const newSubject = new Subject(subj);
        await newSubject.save();
        console.log(`Added subject: ${subj.name}`);
      } catch (error) {
        console.error(`Error adding subject "${subj.name}":`, error);
      }
    }

    console.log("Seeding subjects completed.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("DB connection error:", err);
    process.exit(1);
  });
