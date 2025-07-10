require('dotenv').config();
const mongoose = require('mongoose');
const Lesson = require('../models/Lesson'); // adjust path if necessary

// Replace with the lesson's id you want to update
const lessonId = '67ce159964252c95b8a155ea'; 
// Replace with the new subject id (e.g. the id for "Anh" if that's the correct subject)
const newSubjectId = '67cbfd44297f8a11b7d83d31';

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log('Connected to DB!');
    
    try {
      const lesson = await Lesson.findById(lessonId);
      if (!lesson) {
        console.log('Lesson not found!');
        process.exit(1);
      }
      
      lesson.subject = newSubjectId;
      await lesson.save();
      console.log(`Lesson ${lessonId} updated with new subject ${newSubjectId}`);
      process.exit(0);
    } catch (err) {
      console.error('Error updating lesson:', err);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('DB connection error:', err);
    process.exit(1);
  });
