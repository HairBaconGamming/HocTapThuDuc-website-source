require('dotenv').config();
const mongoose = require('mongoose');
const Subject = require('../models/Subject'); // Adjust path to your Subject model

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log("Connected to DB!");

  // Array of subjects to update, with new image paths
  const subjectImages = [
    { name: "Toán", image: "https://cdn.glitch.global/71030012-56ea-4d26-a426-e0099201df1c/images%20(2).jpg?v=1741520194878" },
    { name: "Văn", image: "https://cdn.glitch.global/71030012-56ea-4d26-a426-e0099201df1c/soan-viet-doan-van-cam-nhan.jpg?v=1741520877177" },
    { name: "Anh", image: "https://cdn.glitch.global/71030012-56ea-4d26-a426-e0099201df1c/luyen-tap-suy-nghi-bang-tieng-anh-banner.jpg?v=1741520286885" }
    // Add more subjects if needed
  ];

  // Loop through each subject in the array and update
  for (const sub of subjectImages) {
    const updated = await Subject.findOneAndUpdate(
      { name: sub.name },             // find by subject name
      { $set: { image: sub.image } }, // set the new image path
      { new: true, upsert: false }    // return updated doc, don't create if missing
    );

    if (updated) {
      console.log(`Updated subject "${sub.name}" with image: ${sub.image}`);
    } else {
      console.log(`Subject "${sub.name}" not found, no update performed.`);
    }
  }

  console.log("Subject images updated!");
  process.exit(0); // exit the script
}).catch(err => {
  console.error(err);
  process.exit(1);
});
