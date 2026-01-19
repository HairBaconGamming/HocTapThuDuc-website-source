#!/usr/bin/env node
/**
 * MongoDB Connection Test Script
 * Usage: node test-db-connection.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const colors = require('colors/safe');

console.log(colors.cyan('\n🔍 MongoDB Connection Test\n'));

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/studypro';

console.log(colors.yellow('Attempting to connect to:'));
console.log(colors.gray(uri.replace(/:[^:]*@/, ':****@'))); // Hide password
console.log();

const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 25000,
  maxPoolSize: 10,
  minPoolSize: 2,
  retryWrites: true,
  retryReads: true,
  connectTimeoutMS: 15000,
};

mongoose.connect(uri.replace(/^"(.*)"$/, '$1'), mongooseOptions)
  .then(() => {
    console.log(colors.green('✅ Connected to MongoDB successfully!\n'));
    
    console.log(colors.cyan('Connection Details:'));
    console.log(colors.gray(`  Host: ${mongoose.connection.host}`));
    console.log(colors.gray(`  Port: ${mongoose.connection.port}`));
    console.log(colors.gray(`  Database: ${mongoose.connection.name}`));
    console.log(colors.gray(`  State: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`));
    console.log();
    
    console.log(colors.green('✓ Your IP is whitelisted in MongoDB Atlas'));
    console.log(colors.green('✓ You can now run: npm start\n'));
    
    mongoose.connection.close();
    process.exit(0);
  })
  .catch(err => {
    console.log(colors.red(`❌ Connection Failed\n`));
    
    console.log(colors.red('Error Message:'));
    console.log(colors.gray(`  ${err.message}\n`));
    
    // Show helpful hints based on error type
    if (err.message.includes('Could not connect to any servers')) {
      console.log(colors.yellow('💡 Possible Solutions:'));
      console.log(colors.gray('   1. Your IP is NOT whitelisted in MongoDB Atlas'));
      console.log(colors.gray('      → Go to: https://cloud.mongodb.com'));
      console.log(colors.gray('      → Cluster → Security → Network Access'));
      console.log(colors.gray('      → Click "+ Add IP Address"'));
      console.log(colors.gray('      → Select "Add My Current IP Address"'));
      console.log(colors.gray('      → Wait 1-2 minutes and try again\n'));
      
      console.log(colors.gray('   2. MongoDB cluster is PAUSED'));
      console.log(colors.gray('      → Go to MongoDB Atlas'));
      console.log(colors.gray('      → Find your cluster'));
      console.log(colors.gray('      → Click "Resume"\n'));
      
      console.log(colors.gray('   3. Wrong MongoDB URI in .env'));
      console.log(colors.gray('      → Check your MONGO_URI value'));
      console.log(colors.gray('      → Must be: mongodb+srv://user:pass@host/database\n'));
    }
    
    if (err.message.includes('ECONNREFUSED')) {
      console.log(colors.yellow('💡 MongoDB appears to be running locally'));
      console.log(colors.gray('   But cannot connect. Check:'));
      console.log(colors.gray('   1. MongoDB service is running\n'));
    }
    
    if (err.message.includes('authentication failed')) {
      console.log(colors.yellow('💡 Authentication Error'));
      console.log(colors.gray('   Your password in MONGO_URI may be wrong'));
      console.log(colors.gray('   Check special characters are URL-encoded\n'));
    }
    
    console.log(colors.cyan('For more help:'));
    console.log(colors.gray('   See: MONGODB_TROUBLESHOOTING.md'));
    console.log(colors.gray('   Docs: https://docs.mongodb.com/atlas/security-whitelist/\n'));
    
    process.exit(1);
  });

// Timeout if connection takes too long
setTimeout(() => {
  console.log(colors.red('\n⏱️  Connection timeout (30s)'));
  console.log(colors.yellow('Your network may be blocking MongoDB Atlas'));
  process.exit(1);
}, 30000);
