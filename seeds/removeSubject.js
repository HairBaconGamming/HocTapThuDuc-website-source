require('dotenv').config();
const mongoose = require('mongoose');
const Subject = require('../models/Subject'); // Adjust the path as necessary

// Replace with the subject ID you wish to delete
const subjectIdToDelete = "67d04cb0d3c858fa9970d039";

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(async () => {
    console.log("Connected to DB!");

    try {
      const deleted = await Subject.findByIdAndDelete(subjectIdToDelete);
      if (deleted) {
        console.log(`Subject with ID ${subjectIdToDelete} has been deleted.`);
      } else {
        console.log(`Subject with ID ${subjectIdToDelete} not found.`);
      }
      process.exit(0);
    } catch (error) {
      console.error("Error deleting subject:", error);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("DB connection error:", err);
    process.exit(1);
  });
