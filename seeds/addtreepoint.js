// seeds/seedGrowthPoints.js
const mongoose = require('mongoose');
require('dotenv').config(); // Load environment variables

// --- Configuration ---
const USERNAME_TO_UPDATE = process.argv[2] || 'testuser'; // Get username from arg or default
const POINTS_TO_AWARD = parseInt(process.argv[3], 10) || 50; // Get points from arg or default to 50
const ACTIVITY_SOURCE = process.argv[4] || 'Seed Script Test Points'; // Optional activity source

// --- Model & Utility Imports ---
const User = require('../models/User'); // Adjust path if needed
const { updateGrowth } = require('../utils/growthUtils'); // Adjust path if needed

// --- Mock Socket.IO (if needed by updateGrowth but not essential for seeding) ---
// If updateGrowth STRICTLY requires a real io object and crashes without it,
// you might need a more complex setup or modify updateGrowth to handle null io.
// For now, we'll pass a dummy object with a basic emit function.
const mockIo = {
    to: (userId) => ({ // Chainable 'to' method
        emit: (eventName, data) => {
            console.log(`[Mock IO] Emitting "${eventName}" to user ${userId}:`, data);
            // No actual socket emission happens here
        }
    }),
    // Add other methods if updateGrowth uses them (e.g., io.emit for global)
    emit: (eventName, data) => {
         console.log(`[Mock IO] Emitting "${eventName}" globally:`, data);
    }
};

// --- Database Connection ---
const dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017/yourdbname'; // Replace with your default URI if needed

mongoose.connect(dbUri)
    .then(() => {
        console.log(`Connected to MongoDB at ${dbUri.split('@')[1] || dbUri}`); // Hide credentials if present
        console.log(`Attempting to award ${POINTS_TO_AWARD} points to user "${USERNAME_TO_UPDATE}"...`);
        return User.findOne({ username: USERNAME_TO_UPDATE });
    })
    .then(async (user) => { // Make this callback async to use await
        if (!user) {
            throw new Error(`User "${USERNAME_TO_UPDATE}" not found.`); // Throw error to be caught
        }

        console.log(`Found user: ${user.username} (Current Points: ${user.points || 0})`);

        // --- Call the updateGrowth Utility ---
        // Pass the mock io object. If updateGrowth handles io being null/undefined,
        // you might not need the mock. Check growthUtils.js.
        const growthResult = await updateGrowth(
            user,
            POINTS_TO_AWARD,
            mockIo, // Pass the mock Socket.IO instance
            ACTIVITY_SOURCE
        );

        // updateGrowth should ideally modify the user object directly OR
        // return the updated user object. If it modifies directly AND saves,
        // the next step might not be needed. If it only modifies, we need to save.
        // Assuming updateGrowth modifies the user object passed to it:
        if (!growthResult || growthResult.user !== user) {
             // If updateGrowth doesn't modify the original user obj directly or needs saving
             // We might need to call user.save() here IF growthResult doesn't handle it.
             // Let's assume for now updateGrowth saves the user or the result contains the saved user.
              console.log('Growth result (if returned separately):', growthResult);
        }

        // Fetch the user again to confirm changes (optional but good practice)
        await user.save();
        return User.findById(user._id);
    })
    .then((updatedUser) => {
        if (!updatedUser) {
             throw new Error(`Failed to re-fetch user "${USERNAME_TO_UPDATE}" after update.`);
        }
        console.log(`--- Update Complete ---`);
        console.log(`User: ${updatedUser.username}`);
        console.log(`XP: ${updatedUser.growthPoints}`);
        // Log other relevant growth fields if they exist
        if (updatedUser.treeLevel !== undefined) console.log(`Level: ${updatedUser.treeLevel}`);
        // ... add more fields as needed ...

        console.log(`Successfully awarded ${POINTS_TO_AWARD} points.`);
        mongoose.connection.close(); // Close connection cleanly
        process.exit(0); // Exit script successfully
    })
    .catch(err => {
        console.error("---------------------");
        console.error("Error during seeding:", err.message);
        console.error("---------------------");
        mongoose.connection.close(); // Ensure connection closes on error
        process.exit(1); // Exit script with error code
    });